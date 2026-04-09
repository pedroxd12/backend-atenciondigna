/**
 * Seed para el demo del Hackaton Talent Land 2026.
 *
 * Crea:
 *   - 1 paciente "Ana Garcia" con UUID fijo (compartido con la app Flutter)
 *   - Verifica que existan estudios y sucursales (las inserta si no)
 *   - 1 reservacion para HOY en la sucursal "Coyoacan" con 3 estudios
 *
 * Ejecutar: npx prisma db seed
 */
import { PrismaClient } from '@prisma/client';
import { SEED_CATALOGO } from './seed_catalog';

const prisma = new PrismaClient();

const DEMO_PATIENT_ID = '00000000-0000-0000-0000-000000000001';

async function main() {
  console.log('🌱 Sembrando datos demo...');

  // ── 1. Estado + ciudad + sucursal base (si no existen) ──
  const estado = await prisma.estados.upsert({
    where: { clave_inegi: '09' },
    update: {},
    create: { nombre: 'Ciudad de Mexico', clave_inegi: '09' },
  });

  const ciudad = await prisma.ciudades.findFirst({
    where: { id_estado: estado.id, nombre: 'Coyoacan' },
  });
  const ciudadId =
    ciudad?.id ??
    (
      await prisma.ciudades.create({
        data: { id_estado: estado.id, nombre: 'Coyoacan', clave_inegi: '003' },
      })
    ).id;

  // ── Sucursal MVP: Coyoacan con id=46 ──
  // Forzamos el id 46 para que coincida con SUCURSAL_MVP_ID del modelo
  // de IA y de la app movil. Sin esto, /reservaciones/slots devuelve 404.
  //
  // Horario oficial Salud Digna Coyoacan:
  //   - Lunes a Viernes: 6:00 - 19:00
  //   - Sabado:           6:00 - 17:00
  //   - Domingo:          6:00 - 14:00
  // hora_apertura/hora_cierre guardan la ventana mas amplia (legacy, por
  // si algun consumidor no lee horario_semanal).
  const COYOACAN_ID = 46;
  const HORARIO_COYOACAN = {
    '0': { open: 6, close: 19 }, // Lunes
    '1': { open: 6, close: 19 }, // Martes
    '2': { open: 6, close: 19 }, // Miercoles
    '3': { open: 6, close: 19 }, // Jueves
    '4': { open: 6, close: 19 }, // Viernes
    '5': { open: 6, close: 17 }, // Sabado
    '6': { open: 6, close: 14 }, // Domingo
  };
  await prisma.sucursales.upsert({
    where: { id: COYOACAN_ID },
    update: {
      nombre: 'Salud Digna Coyoacan',
      direccion: 'Av. Universidad 1330, Del Valle, Coyoacan, CDMX',
      latitud: 19.3568,
      longitud: -99.1716,
      hora_apertura: new Date('1970-01-01T06:00:00Z'),
      hora_cierre: new Date('1970-01-01T19:00:00Z'),
      horario_semanal: HORARIO_COYOACAN,
      activa: true,
    },
    create: {
      id: COYOACAN_ID,
      id_ciudad: ciudadId,
      nombre: 'Salud Digna Coyoacan',
      direccion: 'Av. Universidad 1330, Del Valle, Coyoacan, CDMX',
      latitud: 19.3568,
      longitud: -99.1716,
      hora_apertura: new Date('1970-01-01T06:00:00Z'),
      hora_cierre: new Date('1970-01-01T19:00:00Z'),
      horario_semanal: HORARIO_COYOACAN,
      activa: true,
    },
  });
  console.log(
    `  ✓ Sucursal MVP Coyoacan (id=${COYOACAN_ID}) lista (L-V 6-19, S 6-17, D 6-14)`,
  );

  // ── 2. Estudios base ──
  const estudiosBase = [
    {
      id: 2,
      nombre: 'Laboratorio',
      requiere_preparacion: true,
      requiere_orden_medica: false,
      tiempo_espera_promedio_min: 12,
      max_vigencia_muestra_min: 120,
      descripcion:
        'Ayuno minimo de 8 horas. Llevar identificacion oficial. Hidratarse con agua simple',
    },
    {
      id: 5,
      nombre: 'Rayos X',
      requiere_preparacion: false,
      requiere_orden_medica: true,
      tiempo_espera_promedio_min: 8,
      descripcion: 'Quitar objetos metalicos antes del estudio',
    },
    {
      id: 6,
      nombre: 'Ultrasonido abdominal',
      requiere_preparacion: true,
      requiere_orden_medica: true,
      tiempo_espera_promedio_min: 18,
      descripcion:
        'Tomar 1 litro de agua 1 hora antes. No orinar antes del estudio',
    },
  ];

  for (const e of estudiosBase) {
    await prisma.estudios.upsert({
      where: { id: e.id },
      update: {
        requiere_preparacion: e.requiere_preparacion,
        requiere_orden_medica: e.requiere_orden_medica,
        tiempo_espera_promedio_min: e.tiempo_espera_promedio_min,
        descripcion: e.descripcion,
        max_vigencia_muestra_min: e.max_vigencia_muestra_min ?? null,
      },
      create: {
        id: e.id,
        nombre: e.nombre,
        requiere_preparacion: e.requiere_preparacion,
        requiere_orden_medica: e.requiere_orden_medica,
        tiempo_espera_promedio_min: e.tiempo_espera_promedio_min,
        descripcion: e.descripcion,
        max_vigencia_muestra_min: e.max_vigencia_muestra_min ?? null,
      },
    });
  }
  console.log('  ✓ Estudios base creados/actualizados');

  // ── 2.5 CATALOGO COMPLETO (12 categorias del Excel + extras MVP) ──
  // Crea/actualiza un row en `estudios` por cada categoria del catalogo
  // y luego upsertea todas las variantes en `servicios_salud_digna`.
  // Esto reemplaza el catalogo hardcodeado de la app movil.
  //
  // Idempotencia: tanto `id` como `nombre` son unicos en `estudios`.
  // Buscamos primero por id; si existe, solo actualizamos campos
  // (ojo: NO renombramos para no chocar con el unique sobre nombre).
  // Si no existe, buscamos por nombre — si lo encontramos, actualizamos
  // sin tocar el id. Si tampoco existe, creamos uno nuevo con el id
  // pedido (cuando sea posible) o autogenerado.
  let totalInsertados = 0;
  let totalSaltados = 0;

  for (const cat of SEED_CATALOGO) {
    // ── 2.5.a Resolver / crear la categoria en `estudios` ──
    let estudioId: number = cat.id;
    const byId = await prisma.estudios.findUnique({ where: { id: cat.id } });
    if (byId) {
      await prisma.estudios.update({
        where: { id: cat.id },
        data: {
          tiempo_espera_promedio_min: cat.tiempoEsperaPromedioMin,
          tiempo_atencion_promedio_min: cat.tiempoServicioMin,
          activo: true,
        },
      });
    } else {
      const byName = await prisma.estudios.findUnique({
        where: { nombre: cat.nombre },
      });
      if (byName) {
        estudioId = byName.id;
        await prisma.estudios.update({
          where: { id: byName.id },
          data: {
            tiempo_espera_promedio_min: cat.tiempoEsperaPromedioMin,
            tiempo_atencion_promedio_min: cat.tiempoServicioMin,
            activo: true,
          },
        });
      } else {
        const created = await prisma.estudios.create({
          data: {
            id: cat.id,
            nombre: cat.nombre,
            tiempo_espera_promedio_min: cat.tiempoEsperaPromedioMin,
            tiempo_atencion_promedio_min: cat.tiempoServicioMin,
            activo: true,
          },
        });
        estudioId = created.id;
      }
    }
    cat.id = estudioId;

    if (cat.items.length === 0) continue;

    // De-dup por nombre para no chocar con el unique [id_estudio, nombre]
    const vistos = new Set<string>();
    const toInsert: {
      id_estudio: number;
      nombre: string;
      precio: number | null;
      es_paquete: boolean;
      activo: boolean;
    }[] = [];
    for (const it of cat.items) {
      if (vistos.has(it.nombre)) continue;
      vistos.add(it.nombre);
      toInsert.push({
        id_estudio: estudioId,
        nombre: it.nombre,
        precio: it.precio ?? null,
        es_paquete: it.nombre.toLowerCase().includes('paquete'),
        activo: true,
      });
    }

    const antes = await prisma.servicios_salud_digna.count({
      where: { id_estudio: estudioId },
    });

    const result = await prisma.servicios_salud_digna.createMany({
      data: toInsert,
      skipDuplicates: true,
    });

    const despues = await prisma.servicios_salud_digna.count({
      where: { id_estudio: estudioId },
    });

    totalInsertados += result.count;
    totalSaltados += toInsert.length - result.count;

    console.log(
      `    [${cat.nombre.padEnd(22)}] +${result.count
        .toString()
        .padStart(3)} nuevos / ${(toInsert.length - result.count)
        .toString()
        .padStart(3)} saltados / total en BD: ${despues}  (antes ${antes})`,
    );
  }

  const totalEsperado = SEED_CATALOGO.reduce((n, c) => n + c.items.length, 0);
  const totalEnBd = await prisma.servicios_salud_digna.count();
  console.log(
    `  ✓ Catalogo completo: ${SEED_CATALOGO.length} categorias, ` +
      `${totalInsertados} servicios nuevos insertados, ` +
      `${totalSaltados} ya existian. ` +
      `Total esperado en SEED: ${totalEsperado}. Total ahora en BD: ${totalEnBd}.`,
  );

  // ── 3. Sucursal demo: forzamos Coyoacan (id=46) ──
  const sucursalDemo = await prisma.sucursales.findUnique({
    where: { id: COYOACAN_ID },
  });
  if (!sucursalDemo) throw new Error('No se pudo crear la sucursal MVP');

  // Consultorios para TODAS las categorias del catalogo (no solo las base).
  // Usamos las cantidades reales de la hoja "Consultorios x Clinica"
  // del Excel para que el modelo de IA de Coyoacan tenga capacidad real.
  const CONSULTORIOS_COYOACAN: Record<number, number> = {
    1: 1, // DENSITOMETRIA
    2: 1, // LABORATORIO
    3: 1, // MASTOGRAFIA
    4: 1, // PAPANICOLAOU
    5: 1, // RAYOS X
    6: 4, // ULTRASONIDO
    9: 1, // ELECTROCARDIOGRAMA
    11: 1, // TOMOGRAFIA
    12: 1, // RESONANCIA MAGNETICA
    16: 2, // NUTRICION
    38: 1, // OPTICA
    52: 1, // CONSULTA GENERAL
  };

  for (const cat of SEED_CATALOGO) {
    const cantidad = CONSULTORIOS_COYOACAN[cat.id] ?? 1;
    await prisma.sucursales_consultorios.upsert({
      where: {
        id_sucursal_id_estudio: {
          id_sucursal: sucursalDemo.id,
          id_estudio: cat.id,
        },
      },
      update: { cantidad, activo: true },
      create: {
        id_sucursal: sucursalDemo.id,
        id_estudio: cat.id,
        cantidad,
        area_nombre: `Area - ${cat.nombre}`,
        activo: true,
      },
    });
  }
  console.log('  ✓ Consultorios de Coyoacan');

  // ── 4. Paciente demo ──
  await prisma.pacientes.upsert({
    where: { id: DEMO_PATIENT_ID },
    update: { nombre: 'Ana', apellido_paterno: 'Garcia' },
    create: {
      id: DEMO_PATIENT_ID,
      firebase_uid: 'demo-firebase-uid',
      nombre: 'Ana',
      apellido_paterno: 'Garcia',
      apellido_materno: 'Lopez',
      email: 'ana.demo@gmail.com',
      latitud_habitual: 19.3417,
      longitud_habitual: -99.1612,
    },
  });
  console.log(`  ✓ Paciente demo: ${DEMO_PATIENT_ID}`);

  // ── 5. Reservacion para HOY ──
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const manana = new Date(hoy);
  manana.setDate(manana.getDate() + 1);

  const existing = await prisma.reservaciones.findFirst({
    where: {
      id_paciente: DEMO_PATIENT_ID,
      fecha_programada: { gte: hoy, lt: manana },
    },
    include: { reservaciones_servicios: true },
  });

  if (existing) {
    console.log(`  ✓ Reservacion ya existe (id=${existing.id})`);
  } else {
    const reservacion = await prisma.reservaciones.create({
      data: {
        id_paciente: DEMO_PATIENT_ID,
        id_sucursal: sucursalDemo.id,
        fecha_programada: hoy,
        hora_programada: new Date('1970-01-01T07:00:00Z'),
        origen: 'app',
        estado: 'confirmada',
        reservaciones_servicios: {
          create: estudiosBase.map((e, i) => ({
            id_estudio: e.id,
            id_sucursal: sucursalDemo.id,
            estado: 'en_espera',
            orden_atencion: i,
          })),
        },
      },
    });
    console.log(`  ✓ Reservacion creada (id=${reservacion.id})`);
  }

  console.log('\n✅ Seed completado');
  console.log(`   DEMO_PATIENT_ID = ${DEMO_PATIENT_ID}`);
  console.log('   Cambia este UUID en aplicacion/lib/core/config/app_config.dart');
}

main()
  .catch((e) => {
    console.error('❌ Seed fallo:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
