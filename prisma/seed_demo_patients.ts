/**
 * Seed de pacientes simulados para demo convincente del Hackathón.
 *
 * Crea 60 pacientes en distintos estados para que la demo se vea viva:
 *   - 15 pacientes con check-in hecho y en distintas etapas de atención
 *   - 10 pacientes esperando (en cola)
 *   - 10 pacientes con cita confirmada (aún no llegan)
 *   - 10 pacientes completados (ya terminaron todos sus estudios)
 *   - 10 pacientes con encuestas de satisfacción
 *   - 5 pacientes walk-in (sin cita)
 *
 * Ejecutar: npx ts-node prisma/seed_demo_patients.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COYOACAN_ID = 46;

// Nombres mexicanos realistas
const NOMBRES = [
  { nombre: 'María', ap: 'González', am: 'Hernández' },
  { nombre: 'Juan', ap: 'Pérez', am: 'López' },
  { nombre: 'Guadalupe', ap: 'Martínez', am: 'García' },
  { nombre: 'José', ap: 'Rodríguez', am: 'Sánchez' },
  { nombre: 'Fernanda', ap: 'López', am: 'Ramírez' },
  { nombre: 'Carlos', ap: 'Hernández', am: 'Flores' },
  { nombre: 'Rosa', ap: 'García', am: 'Torres' },
  { nombre: 'Miguel', ap: 'Sánchez', am: 'Díaz' },
  { nombre: 'Patricia', ap: 'Ramírez', am: 'Morales' },
  { nombre: 'Roberto', ap: 'Torres', am: 'Jiménez' },
  { nombre: 'Alejandra', ap: 'Flores', am: 'Reyes' },
  { nombre: 'Francisco', ap: 'Díaz', am: 'Cruz' },
  { nombre: 'Carmen', ap: 'Morales', am: 'Ortiz' },
  { nombre: 'Luis', ap: 'Jiménez', am: 'Gutiérrez' },
  { nombre: 'Verónica', ap: 'Reyes', am: 'Mendoza' },
  { nombre: 'Diego', ap: 'Cruz', am: 'Aguilar' },
  { nombre: 'Sofía', ap: 'Ortiz', am: 'Castillo' },
  { nombre: 'Andrés', ap: 'Gutiérrez', am: 'Vargas' },
  { nombre: 'Daniela', ap: 'Mendoza', am: 'Romero' },
  { nombre: 'Javier', ap: 'Aguilar', am: 'Herrera' },
  { nombre: 'Laura', ap: 'Castillo', am: 'Medina' },
  { nombre: 'Ricardo', ap: 'Vargas', am: 'Castro' },
  { nombre: 'Isabel', ap: 'Romero', am: 'Ruiz' },
  { nombre: 'Arturo', ap: 'Herrera', am: 'Domínguez' },
  { nombre: 'Teresa', ap: 'Medina', am: 'Núñez' },
  { nombre: 'Pedro', ap: 'Castro', am: 'Álvarez' },
  { nombre: 'Adriana', ap: 'Ruiz', am: 'Contreras' },
  { nombre: 'Raúl', ap: 'Domínguez', am: 'Ramos' },
  { nombre: 'Silvia', ap: 'Núñez', am: 'Guerrero' },
  { nombre: 'Héctor', ap: 'Álvarez', am: 'Peña' },
  { nombre: 'Claudia', ap: 'Contreras', am: 'Vega' },
  { nombre: 'Óscar', ap: 'Ramos', am: 'Rojas' },
  { nombre: 'Elena', ap: 'Guerrero', am: 'Bautista' },
  { nombre: 'Enrique', ap: 'Peña', am: 'Silva' },
  { nombre: 'Marcela', ap: 'Vega', am: 'León' },
  { nombre: 'Alberto', ap: 'Rojas', am: 'Ríos' },
  { nombre: 'Natalia', ap: 'Bautista', am: 'Estrada' },
  { nombre: 'Manuel', ap: 'Silva', am: 'Ibarra' },
  { nombre: 'Gabriela', ap: 'León', am: 'Solís' },
  { nombre: 'Armando', ap: 'Ríos', am: 'Salazar' },
  { nombre: 'Lucía', ap: 'Estrada', am: 'Mejía' },
  { nombre: 'Ernesto', ap: 'Ibarra', am: 'Delgado' },
  { nombre: 'Beatriz', ap: 'Solís', am: 'Cervantes' },
  { nombre: 'Sergio', ap: 'Salazar', am: 'Fuentes' },
  { nombre: 'Mariana', ap: 'Mejía', am: 'Valdez' },
  { nombre: 'Eduardo', ap: 'Delgado', am: 'Montes' },
  { nombre: 'Valeria', ap: 'Cervantes', am: 'Ponce' },
  { nombre: 'Jorge', ap: 'Fuentes', am: 'Navarro' },
  { nombre: 'Diana', ap: 'Valdez', am: 'Acosta' },
  { nombre: 'Tomás', ap: 'Montes', am: 'Moreno' },
  { nombre: 'Paola', ap: 'Ponce', am: 'Carrillo' },
  { nombre: 'Rafael', ap: 'Navarro', am: 'Luna' },
  { nombre: 'Ivonne', ap: 'Acosta', am: 'Espinoza' },
  { nombre: 'Alfredo', ap: 'Moreno', am: 'Santiago' },
  { nombre: 'Karla', ap: 'Carrillo', am: 'Paredes' },
  { nombre: 'Mauricio', ap: 'Luna', am: 'Ávila' },
  { nombre: 'Lorena', ap: 'Espinoza', am: 'Maldonado' },
  { nombre: 'Víctor', ap: 'Santiago', am: 'Duarte' },
  { nombre: 'Julia', ap: 'Paredes', am: 'Figueroa' },
  { nombre: 'Gerardo', ap: 'Ávila', am: 'Velasco' },
];

// Paquetes de estudios comunes
const PAQUETES = [
  [2, 5],           // Lab + Rayos X
  [2, 6],           // Lab + Ultrasonido
  [2, 5, 6],        // Lab + Rayos X + Ultrasonido
  [2, 9],           // Lab + ECG
  [3],              // Mastografía sola
  [4, 6],           // Papanicolaou + Ultrasonido
  [2, 6, 9],        // Lab + US + ECG
  [5],              // Rayos X solo
  [6],              // Ultrasonido solo
  [1, 11],          // Densitometría + Tomografía
  [2, 5, 9],        // Lab + RX + ECG
  [2, 16],          // Lab + Nutrición
  [2, 3, 6],        // Lab + Mastografía + Ultrasonido
  [9, 5],           // ECG + Rayos X
  [2],              // Lab solo
];

function uuid(n: number): string {
  const hex = n.toString(16).padStart(12, '0');
  return `00000000-0000-0000-0001-${hex}`;
}

function randomDate(baseAge: number): Date {
  const now = new Date();
  const year = now.getFullYear() - baseAge;
  const month = Math.floor(Math.random() * 12);
  const day = 1 + Math.floor(Math.random() * 28);
  return new Date(year, month, day);
}

function randomHour(min: number, max: number): Date {
  const h = min + Math.floor(Math.random() * (max - min));
  const m = Math.floor(Math.random() * 4) * 15; // 0, 15, 30, 45
  return new Date(`1970-01-01T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
}

async function main() {
  console.log('🏥 Sembrando pacientes demo para la demo del Hackathón...\n');

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const manana = new Date(hoy);
  manana.setDate(manana.getDate() + 1);

  // Verificar que la sucursal existe
  const sucursal = await prisma.sucursales.findUnique({ where: { id: COYOACAN_ID } });
  if (!sucursal) {
    console.error('❌ Sucursal Coyoacán no existe. Ejecuta primero: npx prisma db seed');
    process.exit(1);
  }

  let created = 0;

  for (let i = 0; i < 60; i++) {
    const info = NOMBRES[i];
    const patientId = uuid(i + 100);
    const paquete = PAQUETES[i % PAQUETES.length];
    const edad = 25 + Math.floor(Math.random() * 45); // 25-70 años
    const hora = randomHour(6, 14);

    // Crear paciente
    await prisma.pacientes.upsert({
      where: { id: patientId },
      update: {},
      create: {
        id: patientId,
        firebase_uid: `demo-uid-${i + 100}`,
        nombre: info.nombre,
        apellido_paterno: info.ap,
        apellido_materno: info.am,
        email: `${info.nombre.toLowerCase()}.${info.ap.toLowerCase()}@demo.com`,
        fecha_nacimiento: randomDate(edad),
        latitud_habitual: 19.34 + (Math.random() * 0.04 - 0.02),
        longitud_habitual: -99.17 + (Math.random() * 0.04 - 0.02),
      },
    });

    // Determinar estado del paciente
    let estado: string;
    let checkinAt: Date | null = null;
    let servicioEstados: string[];

    if (i < 15) {
      // En proceso — check-in hecho, algunos estudios completados
      estado = 'en_proceso';
      checkinAt = new Date(hoy.getTime() + (6 + Math.random() * 4) * 3600000);
      const completados = Math.floor(Math.random() * paquete.length);
      servicioEstados = paquete.map((_, idx) => {
        if (idx < completados) return 'completado';
        if (idx === completados) return Math.random() > 0.5 ? 'en_proceso' : 'en_espera';
        return 'en_espera';
      });
    } else if (i < 25) {
      // En espera — check-in hecho, todos los estudios en espera
      estado = 'en_proceso';
      checkinAt = new Date(hoy.getTime() + (7 + Math.random() * 3) * 3600000);
      servicioEstados = paquete.map(() => 'en_espera');
    } else if (i < 35) {
      // Confirmada — aún no llegan
      estado = 'confirmada';
      servicioEstados = paquete.map(() => 'en_espera');
    } else if (i < 45) {
      // Completada — todos los estudios terminados
      estado = 'completada';
      checkinAt = new Date(hoy.getTime() + (6 + Math.random() * 2) * 3600000);
      servicioEstados = paquete.map(() => 'completado');
    } else if (i < 55) {
      // Completada con encuesta
      estado = 'completada';
      checkinAt = new Date(hoy.getTime() + (6 + Math.random() * 2) * 3600000);
      servicioEstados = paquete.map(() => 'completado');
    } else {
      // Walk-in
      estado = 'en_proceso';
      checkinAt = new Date();
      servicioEstados = paquete.map(() => 'en_espera');
    }

    // Verificar si ya existe una reservación para hoy
    const existing = await prisma.reservaciones.findFirst({
      where: {
        id_paciente: patientId,
        fecha_programada: { gte: hoy, lt: manana },
      },
    });
    if (existing) continue;

    // Crear reservación
    const reservacion = await prisma.reservaciones.create({
      data: {
        id_paciente: patientId,
        id_sucursal: COYOACAN_ID,
        fecha_programada: hoy,
        hora_programada: hora,
        origen: i >= 55 ? 'walk_in' : 'app',
        estado,
        checkin_at: checkinAt,
        checkin_tipo: checkinAt ? 'qr' : null,
        reservaciones_servicios: {
          create: paquete.map((idEstudio, idx) => {
            const srvEstado = servicioEstados[idx];
            const tiempoEspera = 5 + Math.floor(Math.random() * 20);
            return {
              id_estudio: idEstudio,
              id_sucursal: COYOACAN_ID,
              estado: srvEstado,
              orden_atencion: idx,
              tiempo_espera_predicho_min: tiempoEspera,
              numero_turno: checkinAt ? idx + (i * 3) + 1 : null,
              hora_inicio_espera: checkinAt && srvEstado !== 'en_espera'
                ? new Date(checkinAt.getTime() + idx * 15 * 60000)
                : checkinAt,
              hora_inicio_atencion: srvEstado === 'completado' || srvEstado === 'en_proceso'
                ? new Date(checkinAt!.getTime() + (idx * 15 + tiempoEspera) * 60000)
                : null,
              hora_fin_atencion: srvEstado === 'completado'
                ? new Date(checkinAt!.getTime() + (idx * 15 + tiempoEspera + 10) * 60000)
                : null,
            };
          }),
        },
      },
    });

    // Crear entradas en cola_atencion para pacientes con check-in
    if (checkinAt && estado === 'en_proceso') {
      const servicios = await prisma.reservaciones_servicios.findMany({
        where: { id_reservacion: reservacion.id },
      });
      for (const srv of servicios) {
        if (srv.estado === 'en_espera' || srv.estado === 'llamado') {
          const lastPos = await prisma.cola_atencion.findFirst({
            where: {
              id_sucursal: COYOACAN_ID,
              id_estudio: srv.id_estudio,
              estado: 'activo',
            },
            orderBy: { posicion: 'desc' },
          });
          await prisma.cola_atencion.create({
            data: {
              id_sucursal: COYOACAN_ID,
              id_estudio: srv.id_estudio,
              id_reservacion_srv: srv.id,
              posicion: (lastPos?.posicion ?? 0) + 1,
              prioridad: i >= 55 ? 'sin_cita' : 'cita',
              estado: 'activo',
              tiempo_estimado_min: srv.tiempo_espera_predicho_min,
            },
          });
        }
      }
    }

    // Crear encuestas para pacientes completados (i: 45-54)
    if (i >= 45 && i < 55) {
      await prisma.encuestas.create({
        data: {
          id_reservacion: reservacion.id,
          id_paciente: patientId,
          calificacion_general: 3 + Math.floor(Math.random() * 3), // 3-5
          calificacion_espera: 2 + Math.floor(Math.random() * 4),  // 2-5
          calificacion_trato: 4 + Math.floor(Math.random() * 2),   // 4-5
          calificacion_app: 3 + Math.floor(Math.random() * 3),     // 3-5
          uso_app_checkin: true,
        },
      });
    }

    created++;
  }

  console.log(`✅ ${created} pacientes demo creados con éxito`);
  console.log('   - 15 en proceso (parcialmente atendidos)');
  console.log('   - 10 en espera (check-in hecho, en cola)');
  console.log('   - 10 con cita confirmada (no han llegado)');
  console.log('   - 10 completados');
  console.log('   - 10 completados con encuesta de satisfacción');
  console.log('   - 5 walk-in');
}

main()
  .catch((e) => {
    console.error('❌ Seed de pacientes falló:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
