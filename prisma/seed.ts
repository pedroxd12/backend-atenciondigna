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
import 'dotenv/config';

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

  const sucursalCount = await prisma.sucursales.count();
  if (sucursalCount === 0) {
    await prisma.sucursales.createMany({
      data: [
        {
          id_ciudad: ciudadId,
          nombre: 'Salud Digna Coyoacan',
          direccion: 'Av. Universidad 1900, Coyoacan',
          latitud: 19.3417,
          longitud: -99.1612,
        },
        {
          id_ciudad: ciudadId,
          nombre: 'Salud Digna Del Valle',
          direccion: 'Av. Universidad 800, Del Valle',
          latitud: 19.3742,
          longitud: -99.1647,
        },
        {
          id_ciudad: ciudadId,
          nombre: 'Salud Digna Centro',
          direccion: 'Av. Insurgentes Sur 500, Roma Norte',
          latitud: 19.4203,
          longitud: -99.1655,
        },
      ],
    });
    console.log('  ✓ Sucursales creadas');
  }

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

  // ── 3. Sucursal demo (la primera disponible) ──
  const sucursalDemo = await prisma.sucursales.findFirst({
    orderBy: { id: 'asc' },
  });
  if (!sucursalDemo) throw new Error('No hay sucursales en la BD');

  // Consultorios (al menos 1 por estudio en la sucursal demo)
  for (const e of estudiosBase) {
    await prisma.sucursales_consultorios.upsert({
      where: {
        id_sucursal_id_estudio: {
          id_sucursal: sucursalDemo.id,
          id_estudio: e.id,
        },
      },
      update: {},
      create: {
        id_sucursal: sucursalDemo.id,
        id_estudio: e.id,
        cantidad: 2,
        area_nombre: `Area - ${e.nombre}`,
      },
    });
  }
  console.log('  ✓ Consultorios');

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
