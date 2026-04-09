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

  // ── 2. Estudios base (datos REALES del Excel "Recursos Hackthon 2026") ──
  // Tiempos de espera: hoja "Promedios Espera" filtrado IdSucursal=46 (Coyoacan)
  // Tiempos de atencion: hoja "Tiempos promedio"
  // Consultorios: hoja "Consultorios x Clinica" filtrado IdSucursal=46
  // "Variable" en atencion se estima: RayosX=10, US=15, Tomo=20, RM=30, Optica=12
  const estudiosBase: Array<{
    id: number; nombre: string;
    tiempo_espera_promedio_min: number;
    tiempo_atencion_promedio_min: number;
    tiempo_atencion_variable: boolean;
    requiere_preparacion: boolean;
    requiere_orden_medica: boolean;
    control_puntualidad: boolean;
    max_vigencia_muestra_min: number | null;
    preparacion_horas_min: number | null;
    descripcion: string;
  }> = [
    {
      id: 1, nombre: 'DENSITOMETRIA',
      tiempo_espera_promedio_min: 15, tiempo_atencion_promedio_min: 12,
      tiempo_atencion_variable: false,
      requiere_preparacion: false, requiere_orden_medica: false,
      control_puntualidad: false, max_vigencia_muestra_min: null,
      preparacion_horas_min: null,
      descripcion: 'Sin ropa con metales. Si tiene Tomo o RM con contraste, densitometria va PRIMERO.',
    },
    {
      id: 2, nombre: 'LABORATORIO',
      tiempo_espera_promedio_min: 12, tiempo_atencion_promedio_min: 5,
      tiempo_atencion_variable: false,
      requiere_preparacion: true, requiere_orden_medica: false,
      control_puntualidad: false,
      max_vigencia_muestra_min: 120, // orina max 2 horas
      preparacion_horas_min: 8, // ayuno 8 horas
      descripcion: 'Ayuno de 8-12 horas. Si trae orina de casa, max 2 horas desde recoleccion.',
    },
    {
      id: 3, nombre: 'MASTOGRAFIA',
      tiempo_espera_promedio_min: 15, tiempo_atencion_promedio_min: 8,
      tiempo_atencion_variable: false,
      requiere_preparacion: true, requiere_orden_medica: false,
      control_puntualidad: false, max_vigencia_muestra_min: null,
      preparacion_horas_min: null,
      descripcion: 'No desodorante/talco/cremas. Menores de 35 requieren orden de especialista.',
    },
    {
      id: 4, nombre: 'PAPANICOLAOU',
      tiempo_espera_promedio_min: 10, tiempo_atencion_promedio_min: 8,
      tiempo_atencion_variable: false,
      requiere_preparacion: true, requiere_orden_medica: false,
      control_puntualidad: false, max_vigencia_muestra_min: null,
      preparacion_horas_min: null,
      descripcion: 'Sin cremas/ovulos/duchas vaginales 48h antes. No menstruando. Va ANTES de US transvaginal.',
    },
    {
      id: 5, nombre: 'RAYOS X',
      tiempo_espera_promedio_min: 9, tiempo_atencion_promedio_min: 10,
      tiempo_atencion_variable: true,
      requiere_preparacion: false, requiere_orden_medica: false,
      control_puntualidad: false, max_vigencia_muestra_min: null,
      preparacion_horas_min: null,
      descripcion: 'Quitar objetos metalicos. Abdomen/columna: ayuno de 6h.',
    },
    {
      id: 6, nombre: 'ULTRASONIDO',
      tiempo_espera_promedio_min: 13, tiempo_atencion_promedio_min: 15,
      tiempo_atencion_variable: true,
      requiere_preparacion: true, requiere_orden_medica: false,
      control_puntualidad: false, max_vigencia_muestra_min: null,
      preparacion_horas_min: 6, // ayuno 6h para abdominal
      descripcion: 'Abdominal: ayuno 6h. Pelvico: vejiga llena. Afectado por lab con ayuno → lab primero.',
    },
    {
      id: 9, nombre: 'ELECTROCARDIOGRAMA',
      tiempo_espera_promedio_min: 9, tiempo_atencion_promedio_min: 7,
      tiempo_atencion_variable: false,
      requiere_preparacion: false, requiere_orden_medica: false,
      control_puntualidad: false, max_vigencia_muestra_min: null,
      preparacion_horas_min: null,
      descripcion: 'Sin regla especial. Evitar cafeina 4h antes.',
    },
    {
      id: 11, nombre: 'TOMOGRAFIA',
      tiempo_espera_promedio_min: 20, tiempo_atencion_promedio_min: 20,
      tiempo_atencion_variable: true,
      requiere_preparacion: true, requiere_orden_medica: false,
      control_puntualidad: true,
      max_vigencia_muestra_min: null,
      preparacion_horas_min: 4, // ayuno 4h
      descripcion: 'Preferentemente con cita. Puntualidad estricta o se reasigna. Ayuno 4h si contrastada.',
    },
    {
      id: 12, nombre: 'RESONANCIA MAGNETICA',
      tiempo_espera_promedio_min: 24, tiempo_atencion_promedio_min: 30,
      tiempo_atencion_variable: true,
      requiere_preparacion: true, requiere_orden_medica: false,
      control_puntualidad: true,
      max_vigencia_muestra_min: null,
      preparacion_horas_min: 4, // ayuno 4h
      descripcion: 'Sin objetos metalicos. Avisar implantes/marcapasos/claustrofobia. Puntualidad estricta.',
    },
    {
      id: 16, nombre: 'NUTRICION',
      tiempo_espera_promedio_min: 19, tiempo_atencion_promedio_min: 15,
      tiempo_atencion_variable: false,
      requiere_preparacion: false, requiere_orden_medica: false,
      control_puntualidad: false, max_vigencia_muestra_min: null,
      preparacion_horas_min: null,
      descripcion: 'Sin regla especial. Traer estudios recientes.',
    },
    {
      id: 24, nombre: 'OPTICA',
      tiempo_espera_promedio_min: 9, tiempo_atencion_promedio_min: 12,
      tiempo_atencion_variable: false,
      requiere_preparacion: false, requiere_orden_medica: false,
      control_puntualidad: false, max_vigencia_muestra_min: null,
      preparacion_horas_min: null,
      descripcion: 'Evitar lentes de contacto 24h antes.',
    },
    {
      id: 52, nombre: 'CONSULTA GENERAL',
      tiempo_espera_promedio_min: 15, tiempo_atencion_promedio_min: 15,
      tiempo_atencion_variable: false,
      requiere_preparacion: false, requiere_orden_medica: false,
      control_puntualidad: false, max_vigencia_muestra_min: null,
      preparacion_horas_min: null,
      descripcion: 'Sin preparacion especial.',
    },
  ];

  // Dos pasos para evitar conflictos con unique(id) + unique(nombre) + FKs:
  // 1) Si ya existe una fila con ese nombre pero otro id → update por nombre
  // 2) Si ya existe una fila con ese id → update por id
  // 3) Si no existe → insert
  for (const e of estudiosBase) {
    const fields = {
      requiere_preparacion: e.requiere_preparacion,
      requiere_orden_medica: e.requiere_orden_medica,
      tiempo_espera_promedio_min: e.tiempo_espera_promedio_min,
      tiempo_atencion_promedio_min: e.tiempo_atencion_promedio_min,
      tiempo_atencion_variable: e.tiempo_atencion_variable,
      control_puntualidad: e.control_puntualidad,
      max_vigencia_muestra_min: e.max_vigencia_muestra_min ?? null,
      preparacion_horas_min: e.preparacion_horas_min ?? null,
      descripcion: e.descripcion,
      activo: true,
    };
    const byId = await prisma.estudios.findUnique({ where: { id: e.id } });
    const byName = await prisma.estudios.findUnique({ where: { nombre: e.nombre } });

    if (byId) {
      // Existe con ese id → update (incluye renombrar si hace falta)
      // Primero limpiar nombre duplicado en otro id
      if (byName && byName.id !== e.id) {
        // Hay otra fila con este nombre: update ESA para renombrarla
        await prisma.estudios.update({
          where: { id: byName.id },
          data: { nombre: `${e.nombre}_old_${byName.id}` },
        });
      }
      await prisma.estudios.update({
        where: { id: e.id },
        data: { nombre: e.nombre, ...fields },
      });
    } else if (byName) {
      // Existe con ese nombre pero otro id → update por nombre
      await prisma.estudios.update({
        where: { nombre: e.nombre },
        data: fields,
      });
    } else {
      // No existe → create
      await prisma.estudios.create({
        data: { id: e.id, nombre: e.nombre, ...fields },
      });
    }
  }
  console.log('  ✓ Estudios base: 12 categorias con tiempos reales del Excel');

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
  // Datos REALES de hoja "Consultorios x Clinica" filtrado IdSucursal=46.
  // Incluye los 15 consultorios que tiene Coyoacan.
  const CONSULTORIOS_COYOACAN: Record<number, { cantidad: number; nombre: string }> = {
    1:  { cantidad: 1, nombre: 'DENSITOMETRIA' },
    2:  { cantidad: 1, nombre: 'LABORATORIO' },
    3:  { cantidad: 1, nombre: 'MASTOGRAFIA' },
    4:  { cantidad: 1, nombre: 'PAPANICOLAOU' },
    5:  { cantidad: 1, nombre: 'RAYOS X' },
    6:  { cantidad: 4, nombre: 'ULTRASONIDO' },
    9:  { cantidad: 1, nombre: 'ELECTROCARDIOGRAMA' },
    11: { cantidad: 1, nombre: 'TOMOGRAFIA' },
    12: { cantidad: 1, nombre: 'RESONANCIA MAGNETICA' },
    16: { cantidad: 2, nombre: 'NUTRICION' },
    18: { cantidad: 1, nombre: 'MIDO' },
    56: { cantidad: 1, nombre: 'BIOPSIAS' },
    57: { cantidad: 1, nombre: 'TOMOSINTESIS' },
    58: { cantidad: 1, nombre: 'MASTOGRAFIA CONTRASTADA' },
    59: { cantidad: 1, nombre: 'BIOPSIAS MASTOGRAFIA' },
  };

  // Insertar consultorios de las categorias del catalogo + los 15 reales
  const todosConsultorios = new Map<number, { cantidad: number; nombre: string }>();
  // Primero los del catalogo (por defecto 1)
  for (const cat of SEED_CATALOGO) {
    todosConsultorios.set(cat.id, { cantidad: 1, nombre: cat.nombre });
  }
  // Sobreescribir con los reales de Coyoacan (que tienen las cantidades correctas)
  for (const [id, info] of Object.entries(CONSULTORIOS_COYOACAN)) {
    todosConsultorios.set(Number(id), info);
  }
  for (const [idEstudio, info] of todosConsultorios) {
    // Solo crear si el estudio existe en la BD
    const existe = await prisma.estudios.findUnique({ where: { id: idEstudio } });
    if (!existe) continue;
    await prisma.sucursales_consultorios.upsert({
      where: {
        id_sucursal_id_estudio: {
          id_sucursal: sucursalDemo.id,
          id_estudio: idEstudio,
        },
      },
      update: { cantidad: info.cantidad, activo: true },
      create: {
        id_sucursal: sucursalDemo.id,
        id_estudio: idEstudio,
        cantidad: info.cantidad,
        area_nombre: `Area - ${info.nombre}`,
        activo: true,
      },
    });
  }
  console.log(`  ✓ Consultorios de Coyoacan: ${todosConsultorios.size} areas`);

  // ── 4. Usuarios staff demo ──
  await prisma.usuarios_staff.upsert({
    where: { email: 'recepcion@atenciondigna.com' },
    update: {
      nombre: 'Laura',
      apellido: 'Perez',
      rol: 'recepcionista',
      activo: true,
    },
    create: {
      id_sucursal: sucursalDemo.id,
      nombre: 'Laura',
      apellido: 'Perez',
      email: 'recepcion@atenciondigna.com',
      rol: 'recepcionista',
      activo: true,
    },
  });

  await prisma.usuarios_staff.upsert({
    where: { email: 'medico@atenciondigna.com' },
    update: {
      nombre: 'Carlos',
      apellido: 'Lopez',
      rol: 'medico',
      activo: true,
    },
    create: {
      id_sucursal: sucursalDemo.id,
      nombre: 'Carlos',
      apellido: 'Lopez',
      email: 'medico@atenciondigna.com',
      rol: 'medico',
      activo: true,
    },
  });
  console.log('  ✓ Staff demo: recepcion@atenciondigna.com / medico@atenciondigna.com');

  // ── 5. Paciente demo ──
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

  // ── 6. Reservacion para HOY ──
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
          // Solo 3 estudios comunes para la demo (Lab, Rayos X, Ultrasonido)
          create: [2, 5, 6].map((idEstudio, i) => ({
            id_estudio: idEstudio,
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
