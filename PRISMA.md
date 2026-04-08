# Backend NestJS — Conexión a Postgres con Prisma

El backend usa Prisma como ORM contra la base de datos Postgres alojada en
Railway. La URL de conexión vive en `.env`:

```env
DATABASE_URL="postgres://postgres:...@junction.proxy.rlwy.net:36446/railway"
```

## Estructura

```
backend/
├── prisma/
│   ├── schema.prisma   ← introspectado de la BD existente (21 modelos)
│   └── seed.ts         ← paciente demo + reservacion de hoy
├── prisma.config.ts    ← lee DATABASE_URL via dotenv
└── src/
    ├── prisma/
    │   ├── prisma.service.ts   ← PrismaClient con onModuleInit/Destroy
    │   └── prisma.module.ts    ← @Global() — disponible en todo el app
    └── common/
        └── saturation.ts       ← levelFromMinutes + haversine
```

`PrismaModule` está marcado `@Global()`, así que cualquier service puede
inyectar `PrismaService` sin importar el módulo.

## Comandos disponibles

```bash
# Regenerar el cliente despues de cambiar schema.prisma
npm run prisma:generate

# Re-introspectar la BD (cuando cambia el schema en el servidor)
npm run prisma:pull

# UI web para inspeccionar la BD
npm run prisma:studio

# Sembrar paciente demo + reservacion de hoy
npm run db:seed

# Levantar el backend en watch mode
npm run start:dev
```

## Mapeo módulo → tabla

| Módulo Nest | Tablas Postgres usadas |
|---|---|
| `BranchesModule`  | `sucursales`, `predicciones_ia` |
| `StudiesModule`   | `reservaciones`, `reservaciones_servicios`, `estudios`, `sucursales_consultorios` |
| `CheckinModule`   | `reservaciones`, `reservaciones_servicios`, `cola_atencion`, `estudios` |
| `WaitingModule`   | `reservaciones`, `reservaciones_servicios`, `cola_atencion`, `sucursales_consultorios` |
| `SurveyModule`    | `encuestas`, `reservaciones` |
| `ResultsModule`   | `resultados_estudios`, `estudios`, `reservaciones_servicios`, `sucursales` |

## Lo que hace el seed

`npx prisma db seed` (o `npm run db:seed`) crea:

1. **Estado** Ciudad de México + ciudad Coyoacán
2. **3 sucursales** (Coyoacán, Del Valle, Centro) si no existen
3. **3 estudios base** (Laboratorio id=2, Rayos X id=5, Ultrasonido id=6) con
   `requiere_orden_medica`, `max_vigencia_muestra_min`, etc.
4. **Consultorios** para cada estudio en la sucursal demo
5. **Paciente demo** con UUID fijo `00000000-0000-0000-0000-000000000001`
   (el mismo `AppConfig.demoPatientId` de la app Flutter)
6. **Reservación de hoy** con los 3 estudios en estado `en_espera`

Después del seed, la app Flutter en modo `USE_REMOTE=true` ya puede leer
datos reales sin más configuración.

## Detalles importantes

- **BigInt**: muchas tablas (`reservaciones`, `encuestas`, `resultados_estudios`)
  usan `BIGINT` como PK. Prisma lo expone como `bigint` nativo de JS, que
  `JSON.stringify` no soporta. En `src/main.ts` agregamos
  `BigInt.prototype.toJSON = () => this.toString()` para que las respuestas
  se serialicen como string.
- **Geography column**: la columna `sucursales.ubicacion` es de tipo
  `geography` (PostGIS). Prisma la marca como `Unsupported` y la ignora.
  Usamos `latitud` / `longitud` (Decimal) en su lugar.
- **uuid_generate_v4()**: el modelo `pacientes` tiene
  `@default(dbgenerated("uuid_generate_v4()"))`. Se asume que la extension
  `uuid-ossp` está instalada en la BD.
- **Transactions**: el `redeem` del checkin debería ser una transacción
  (`prisma.$transaction([...])`) para garantizar atomicidad. Lo dejé como
  promesas paralelas para mantener la lógica clara durante el demo —
  ajustar antes de producción.

## Probar la integración end-to-end

```bash
# Terminal 1 — IA
cd modelo-ia && uvicorn app.main:app --port 8000

# Terminal 2 — Backend (lee DATABASE_URL del .env y AI_SERVICE_URL=http://localhost:8000)
cd backend
npm run prisma:generate     # solo la primera vez
npm run db:seed             # crea paciente + reservacion demo
npm run start:dev

# Terminal 3 — App Flutter contra el backend local
cd aplicacion
flutter run --dart-define=USE_REMOTE=true
```

Smoke tests con `curl`:

```bash
# Lista de sucursales
curl http://localhost:3000/sucursales

# Sucursales mas cercanas + tiempo IA
curl "http://localhost:3000/sucursales/cercanas?lat=19.34&lng=-99.16&id_estudio=2"

# Estudios del dia del paciente demo
curl http://localhost:3000/pacientes/00000000-0000-0000-0000-000000000001/estudios-hoy

# Generar pase QR
curl -X POST http://localhost:3000/checkin/pase \
  -H "Content-Type: application/json" \
  -d '{"patientId":"00000000-0000-0000-0000-000000000001","branchId":1,"studyIds":[2,5,6]}'
```
