import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  Observable,
  from,
  interval,
  switchMap,
  distinctUntilChanged,
} from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import {
  CreateSmartAppointmentDto,
  RescheduleAppointmentDto,
} from './dto/smart-appointment.dto';
import {
  DynamicReorderResponse,
  OptimalSlotResponse,
  PacienteContext,
  RescheduleResponse,
  ServicioPendienteDto,
  SlotCandidato,
} from '../ai/dto/predict.dto';

/**
 * Orquesta el motor de agenda inteligente del microservicio IA con la BD.
 *
 * Responsabilidades:
 *   1. Smart-create: pedir el mejor slot al modelo y persistir la reservación.
 *   2. Reschedule: cuando el paciente llega tarde / no se presenta / cancela,
 *      pide un nuevo slot al modelo y actualiza la reservación.
 *   3. Live plan: combina el estado actual de `cola_atencion` con el modelo
 *      de reordenamiento dinámico para devolver/streamear el plan vigente
 *      del paciente.
 *   4. Auto-rescheduling: detecta automáticamente que un paciente con estudio
 *      de puntualidad estricta llegó tarde y dispara reschedule.
 */
/** Formatea minutos del dia a "HH:MM". Ej: 375 → "06:15" */
function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Devuelve la hora y minutos actuales en la zona horaria de Mexico (CDMX).
 * Railway corre en UTC; sin esto, getHours() devuelve hora UTC y el
 * sistema cree que son las 3 AM cuando en realidad son las 9 PM.
 */
function nowCDMX(): { hours: number; minutes: number; dateStr: string } {
  const now = new Date();
  // Intl formatea en la zona especificada sin dependencias externas
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(now)
    .reduce(
      (acc, p) => {
        acc[p.type] = p.value;
        return acc;
      },
      {} as Record<string, string>,
    );
  return {
    hours: parseInt(parts.hour ?? '0'),
    minutes: parseInt(parts.minute ?? '0'),
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  // ──────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────
  private async ensurePatient(id: string) {
    const p = await this.prisma.pacientes.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Paciente no encontrado');
    return p;
  }

  private async ensureBranch(id: number) {
    const b = await this.prisma.sucursales.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Sucursal no encontrada');
    return b;
  }

  private edadFrom(fechaNac: Date | null | undefined): number | undefined {
    if (!fechaNac) return undefined;
    const diff = Date.now() - new Date(fechaNac).getTime();
    return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
  }

  private buildPacienteContext(
    paciente: { fecha_nacimiento: Date | null },
    extras?: {
      prioridad?: 'urgente' | 'cita' | 'sin_cita';
    } & Partial<PacienteContext>,
  ): PacienteContext {
    return {
      edad: this.edadFrom(paciente.fecha_nacimiento),
      prioridad: extras?.prioridad ?? 'cita',
      ...(extras ?? {}),
    };
  }

  private hourFromTime(t?: Date | null): number | undefined {
    if (!t) return undefined;
    return new Date(t).getUTCHours();
  }

  // ──────────────────────────────────────────────
  // 1) Smart create
  // ──────────────────────────────────────────────
  async smartCreate(dto: CreateSmartAppointmentDto) {
    if (!dto.studyIds?.length) {
      throw new BadRequestException('studyIds vacío');
    }

    const paciente = await this.ensurePatient(dto.patientId);
    const sucursal = await this.ensureBranch(dto.branchId);

    const horaApertura =
      dto.horaApertura ?? this.hourFromTime(sucursal.hora_apertura) ?? 7;
    const horaCierre =
      dto.horaCierre ?? this.hourFromTime(sucursal.hora_cierre) ?? 20;

    const ctx = this.buildPacienteContext(paciente, {
      prioridad: dto.prioridad ?? 'cita',
      ...(dto.patientContext ?? {}),
    });

    const propuesta: OptimalSlotResponse = await this.ai.optimalSlot({
      id_sucursal: dto.branchId,
      fecha: dto.date,
      estudios: dto.studyIds,
      paciente: ctx,
      hora_apertura: horaApertura,
      hora_cierre: horaCierre,
      duracion_estimada_min: 45,
      top_n: 3,
    });

    const slot = propuesta.mejor_slot;

    // Si confirm=false, sólo devolvemos la propuesta (preview).
    if (dto.confirm === false) {
      return {
        preview: true,
        slots: propuesta.slots,
        bestSlot: slot,
        validations: propuesta.validaciones,
      };
    }

    // Persistir reservación con orden recomendado y tiempos predichos
    const fecha = new Date(`${slot.fecha}T00:00:00Z`);
    const horaProgramada = new Date(
      `1970-01-01T${String(slot.hora).padStart(2, '0')}:00:00Z`,
    );

    const reservacion = await this.prisma.reservaciones.create({
      data: {
        id_paciente: dto.patientId,
        id_sucursal: dto.branchId,
        fecha_programada: fecha,
        hora_programada: horaProgramada,
        origen: 'app_smart',
        estado: 'pendiente',
        reservaciones_servicios: {
          create: slot.orden_recomendado.map((idEstudio, i) => {
            const pred = propuesta.slots[0]; // contexto del slot elegido
            return {
              id_estudio: idEstudio,
              id_sucursal: dto.branchId,
              estado: 'en_espera',
              orden_atencion: i,
              tiempo_espera_predicho_min: Math.round(
                pred.tiempo_total_estimado_min / slot.orden_recomendado.length,
              ),
            };
          }),
        },
      },
      include: { reservaciones_servicios: true },
    });

    return {
      id: reservacion.id.toString(),
      patientId: reservacion.id_paciente,
      branchId: reservacion.id_sucursal,
      date: reservacion.fecha_programada.toISOString().substring(0, 10),
      time: reservacion.hora_programada?.toISOString().substring(11, 16),
      status: reservacion.estado,
      smartScore: slot.score,
      reason: slot.razon,
      saturationLevel: slot.nivel_saturacion_promedio,
      estimatedTotalMin: slot.tiempo_total_estimado_min,
      orderedStudyIds: slot.orden_recomendado,
      alternativeSlots: propuesta.slots.slice(1),
      validations: propuesta.validaciones,
    };
  }

  // ──────────────────────────────────────────────
  // 2) Reschedule
  // ──────────────────────────────────────────────
  async reschedule(reservacionId: string, dto: RescheduleAppointmentDto) {
    const reservacion = await this.prisma.reservaciones.findUnique({
      where: { id: BigInt(reservacionId) },
      include: {
        pacientes: true,
        reservaciones_servicios: { include: { estudios: true } },
      },
    });
    if (!reservacion) throw new NotFoundException('Reservación no encontrada');

    const ahora = new Date();
    const ctx = this.buildPacienteContext(reservacion.pacientes, {
      prioridad: 'cita',
      llego_a_tiempo: dto.reason === 'tarde' ? false : undefined,
    });

    const respuesta: RescheduleResponse = await this.ai.reschedule({
      id_sucursal: reservacion.id_sucursal,
      fecha_actual: reservacion.fecha_programada.toISOString().substring(0, 10),
      hora_actual:
        this.hourFromTime(reservacion.hora_programada) ?? ahora.getUTCHours(),
      estudios: reservacion.reservaciones_servicios.map((s) => s.id_estudio),
      motivo: {
        tipo: dto.reason,
        minutos_retraso: dto.minutosRetraso,
        nota: dto.nota,
      },
      paciente: ctx,
      permitir_siguiente_dia: dto.permitirSiguienteDia ?? true,
    });

    const slot = respuesta.nuevo_slot;
    const nuevaFecha = new Date(`${slot.fecha}T00:00:00Z`);
    const nuevaHora = new Date(
      `1970-01-01T${String(slot.hora).padStart(2, '0')}:00:00Z`,
    );

    // Actualiza reservación + reordena servicios según nuevo plan
    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.reservaciones.update({
        where: { id: reservacion.id },
        data: {
          fecha_programada: nuevaFecha,
          hora_programada: nuevaHora,
          estado: 'reagendada',
          notas:
            (reservacion.notas ? reservacion.notas + '\n' : '') +
            `[reagendada ${ahora.toISOString()}] motivo=${respuesta.motivo_aplicado}`,
          updated_at: ahora,
        },
      });

      // Reordenar servicios según el nuevo orden recomendado
      const ordenMap = new Map<number, number>();
      slot.orden_recomendado.forEach((id, idx) => ordenMap.set(id, idx));
      await Promise.all(
        reservacion.reservaciones_servicios.map((s) =>
          tx.reservaciones_servicios.update({
            where: { id: s.id },
            data: {
              orden_atencion: ordenMap.get(s.id_estudio) ?? s.orden_atencion,
              estado: 'en_espera',
            },
          }),
        ),
      );

      return r;
    });

    return {
      id: updated.id.toString(),
      newDate: slot.fecha,
      newTime: `${String(slot.hora).padStart(2, '0')}:00`,
      reason: respuesta.motivo_aplicado,
      requiredNextDay: respuesta.requirio_dia_siguiente,
      affectedStudies: respuesta.estudios_afectados,
      smartScore: slot.score,
      saturationLevel: slot.nivel_saturacion_promedio,
      orderedStudyIds: slot.orden_recomendado,
      validations: respuesta.validaciones,
    };
  }

  // ──────────────────────────────────────────────
  // 3) Live plan (snapshot del paciente con reordenamiento dinámico)
  // ──────────────────────────────────────────────
  async livePlan(patientId: string) {
    await this.ensurePatient(patientId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const reservacion = await this.prisma.reservaciones.findFirst({
      where: {
        id_paciente: patientId,
        fecha_programada: { gte: today, lt: tomorrow },
        estado: { in: ['pendiente', 'confirmada', 'en_proceso', 'reagendada'] },
      },
      include: {
        reservaciones_servicios: {
          include: { estudios: true },
          orderBy: { orden_atencion: 'asc' },
        },
        pacientes: true,
      },
    });

    if (!reservacion) {
      return {
        active: false,
        services: [],
        order: [],
        message: 'Sin reservación activa para hoy',
      };
    }

    // Mapear estado del backend → estado del modelo
    const estadoMap: Record<string, ServicioPendienteDto['estado']> = {
      en_espera: 'en_espera',
      llamado: 'llamado',
      en_proceso: 'en_proceso',
      finalizado: 'completado',
      completado: 'completado',
    };

    const servicios: ServicioPendienteDto[] = await Promise.all(
      reservacion.reservaciones_servicios.map(async (s) => {
        // Cuenta de personas en cola actual para este estudio en la sucursal
        const colaCount = await this.prisma.cola_atencion.count({
          where: {
            id_sucursal: reservacion.id_sucursal,
            id_estudio: s.id_estudio,
            estado: 'activo',
          },
        });
        // Consultorios activos para este estudio
        const consultoriosCount =
          await this.prisma.sucursales_consultorios.findFirst({
            where: {
              id_sucursal: reservacion.id_sucursal,
              id_estudio: s.id_estudio,
              activo: true,
            },
          });
        return {
          id_estudio: s.id_estudio,
          estado: estadoMap[s.estado] ?? 'en_espera',
          pacientes_en_cola: colaCount,
          consultorios_activos: consultoriosCount?.cantidad ?? undefined,
        };
      }),
    );

    const cdmxNow = nowCDMX();
    const reorder: DynamicReorderResponse = await this.ai.dynamicReorder({
      id_sucursal: reservacion.id_sucursal,
      hora: cdmxNow.hours,
      dia_semana: ((new Date().getDay() + 6) % 7), // JS: Dom=0; modelo: Lun=0
      servicios,
      paciente: this.buildPacienteContext(reservacion.pacientes, {
        prioridad: 'cita',
      }),
    });

    // Si hubo cambio en el orden, persiste para que la app lo refleje
    if (reorder.cambios && reorder.nuevo_orden.length > 0) {
      const ordenMap = new Map<number, number>();
      reorder.nuevo_orden.forEach((id, idx) => ordenMap.set(id, idx));
      await Promise.all(
        reservacion.reservaciones_servicios
          .filter((s) => ordenMap.has(s.id_estudio))
          .map((s) =>
            this.prisma.reservaciones_servicios.update({
              where: { id: s.id },
              data: { orden_atencion: ordenMap.get(s.id_estudio)! },
            }),
          ),
      );
    }

    return {
      active: true,
      reservationId: reservacion.id.toString(),
      branchId: reservacion.id_sucursal,
      reordered: reorder.cambios,
      reason: reorder.razon,
      order: reorder.nuevo_orden,
      totalRemainingMin: reorder.tiempo_total_restante_min,
      services: reorder.predicciones.map((p) => ({
        studyId: p.id_estudio,
        name: p.nombre_estudio,
        estimatedMin: p.tiempo_espera_pred_min,
        saturation: p.nivel_saturacion,
        requiresPrep: p.requiere_preparacion,
      })),
      validations: reorder.validaciones,
    };
  }

  /** SSE — emite el plan vigente cada 5s y suprime emisiones idénticas. */
  livePlanStream(patientId: string): Observable<{ data: any }> {
    return interval(5000).pipe(
      switchMap(() => from(this.livePlan(patientId))),
      distinctUntilChanged(
        (a, b) =>
          JSON.stringify(a.order) === JSON.stringify(b.order) &&
          a.totalRemainingMin === b.totalRemainingMin,
      ),
      switchMap((data) => from(Promise.resolve({ data }))),
    );
  }

  // ──────────────────────────────────────────────
  // ──────────────────────────────────────────────
  // 4) Auto-detect tardanza y reagendar (para checkin)
  // ──────────────────────────────────────────────
  // ──────────────────────────────────────────────
  // ──────────────────────────────────────────────
  // 4.5) Motor inteligente de recomendacion de horarios
  // ──────────────────────────────────────────────
  /**
   * Motor de slots GRANULARES.
   *
   * En lugar de devolver horas fijas (6:00, 7:00...), genera slots cada
   * N minutos basado en el tiempo de atencion del servicio mas corto.
   *
   * Ej: Laboratorio = 5 min de atencion, 1 consultorio → slots cada 5 min.
   *     Si hay 2 consultorios → cada slot soporta 2 pacientes simultaneos.
   *
   * Para cada slot verifica CAPACIDAD REAL:
   *   - Cuantas citas ya registradas caen en esa ventana temporal.
   *   - Cuantos consultorios tiene ese estudio.
   *   - Si citas_en_ventana < consultorios → hay espacio → slot disponible.
   *
   * Resultado: el paciente ve opciones como 6:00, 6:10, 6:20... con
   * indicacion de cuantos lugares quedan y tiempo estimado real.
   */
  async availableSlots(params: {
    branchId: number;
    date: string;
    studyIds: number[];
    topN: number;
  }) {
    if (!params.studyIds.length) {
      throw new BadRequestException('studyIds vacio');
    }
    const sucursal = await this.ensureBranch(params.branchId);

    // ── Horario del dia ──
    const fechaObj = new Date(`${params.date}T00:00:00`);
    const jsDow = fechaObj.getDay();
    const dow = (jsDow + 6) % 7;
    const DIAS = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
    const diaNombre = DIAS[dow];

    const horarioJson = sucursal.horario_semanal as
      | Record<string, { open: number; close: number }> | null | undefined;
    const hdia = horarioJson?.[String(dow)];
    const horaApertura = hdia?.open ?? (this.hourFromTime(sucursal.hora_apertura) ?? 6);
    const horaCierre = hdia?.close ?? (this.hourFromTime(sucursal.hora_cierre) ?? 19);

    if (horaApertura >= horaCierre) {
      return {
        branchId: params.branchId, date: params.date,
        studyIds: params.studyIds, slots: [], validations: [],
        message: `La sucursal no abre los ${diaNombre}.`,
        weeklyHours: { open: horaApertura, close: horaCierre },
      };
    }

    // Hora actual en CDMX (Railway corre en UTC — sin esto, cree que
    // son las 3 AM cuando en Mexico son las 9 PM y muestra slots del pasado).
    const cdmx = nowCDMX();
    const esHoy = cdmx.dateStr === params.date;
    // Si es hoy, minimo la hora actual + 30 min para que le de tiempo de llegar
    const minutosMinHoy = esHoy
      ? cdmx.hours * 60 + cdmx.minutes + 30
      : 0;

    // ── Datos de estudios de la BD ──
    const estudiosDB = await this.prisma.estudios.findMany({
      where: { id: { in: params.studyIds } },
    });
    const atencionMap = new Map(estudiosDB.map(e => [e.id, e.tiempo_atencion_promedio_min ?? 10]));
    const esperaMap = new Map(estudiosDB.map(e => [e.id, e.tiempo_espera_promedio_min ?? 20]));
    const prepMap = new Map(estudiosDB.map(e => [e.id, e.requiere_preparacion]));
    const tiempoAtencionTotal = params.studyIds.reduce((a, id) => a + (atencionMap.get(id) ?? 10), 0);

    // ── Intervalo de slots: basado en el servicio mas corto, min 10 min ──
    const serviceTimes = params.studyIds.map(id => atencionMap.get(id) ?? 10);
    const intervalo = Math.max(10, Math.min(...serviceTimes));

    // ── Orden recomendado (sin prep primero + secuencias) ──
    const sinPrep = params.studyIds.filter(id => !prepMap.get(id));
    const conPrep = params.studyIds.filter(id => prepMap.get(id));
    const ordenOptimo = [...sinPrep, ...conPrep];
    const SECUENCIAS: [number, number][] = [[1,11],[1,12],[4,6],[4,24],[4,56],[2,6]];
    for (let iter = 0; iter < 8; iter++) {
      let changed = false;
      for (const [p, s] of SECUENCIAS) {
        const i1 = ordenOptimo.indexOf(p);
        const i2 = ordenOptimo.indexOf(s);
        if (i1 >= 0 && i2 >= 0 && i1 > i2) {
          ordenOptimo.splice(i1, 1);
          ordenOptimo.splice(i2, 0, p);
          changed = true;
        }
      }
      if (!changed) break;
    }

    // ── Validaciones por reglas de negocio ──
    const validaciones: Array<{ regla: string; severidad: string; mensaje: string; accion?: string }> = [];
    for (const e of estudiosDB) {
      const n = e.nombre.toUpperCase();
      if (n.includes('MASTOGRAFIA') || n.includes('MASTOGRAFÍA')) {
        validaciones.push({
          regla: 'mastografia.preparacion', severidad: 'info',
          mensaje: 'No uses desodorante, talco ni cremas el dia del estudio.',
          accion: 'Si tienes menos de 35 anos, trae orden medica de especialista.',
        });
      }
      if (n.includes('TOMOGRAFIA') || n.includes('TOMOGRAFÍA') || n.includes('RESONANCIA')) {
        validaciones.push({
          regla: 'puntualidad.estricta', severidad: 'warning',
          mensaje: `${e.nombre}: debes llegar puntual o se reasignara tu cita.`,
        });
      }
      if (n.includes('LABORATORIO')) {
        validaciones.push({
          regla: 'laboratorio.ayuno', severidad: 'info',
          mensaje: 'Requiere ayuno de 8-12 horas. Si traes orina, max 2 horas de recolectada.',
        });
      }
      if (n.includes('PAPANICOLAOU')) {
        validaciones.push({
          regla: 'papanicolaou.orden', severidad: 'info',
          mensaje: 'Si tienes otros estudios ginecologicos, Papanicolaou va primero.',
        });
      }
    }

    // ── Consultorios por estudio ──
    const consultorios = await this.prisma.sucursales_consultorios.findMany({
      where: { id_sucursal: params.branchId, activo: true },
    });
    const capMap = new Map(consultorios.map(c => [c.id_estudio, c.cantidad]));

    // ── Citas registradas para ese dia con sus horas exactas ──
    const fechaStart = new Date(`${params.date}T00:00:00Z`);
    const fechaEnd = new Date(`${params.date}T23:59:59Z`);
    const citasDelDia = await this.prisma.reservaciones.findMany({
      where: {
        id_sucursal: params.branchId,
        fecha_programada: { gte: fechaStart, lte: fechaEnd },
        estado: { in: ['pendiente', 'confirmada', 'en_proceso'] },
      },
      include: { reservaciones_servicios: true },
    });

    // Mapa de citas por minuto-estudio: para cada estudio, en que minutos
    // del dia hay una cita que ocupa un consultorio.
    // cita en minuto M con atencion T → ocupa [M, M+T)
    const ocupacionPorEstudio = new Map<number, Array<{ inicio: number; fin: number }>>();
    for (const id of params.studyIds) {
      ocupacionPorEstudio.set(id, []);
    }
    for (const r of citasDelDia) {
      const horaCita = r.hora_programada
        ? new Date(r.hora_programada).getUTCHours() * 60 +
          new Date(r.hora_programada).getUTCMinutes()
        : 8 * 60;
      for (const s of r.reservaciones_servicios) {
        const arr = ocupacionPorEstudio.get(s.id_estudio);
        if (arr) {
          const dur = atencionMap.get(s.id_estudio) ?? 10;
          arr.push({ inicio: horaCita, fin: horaCita + dur });
        }
      }
    }

    const totalCitasDia = citasDelDia.length;

    // ── Funcion para contar cuantos consultorios estan ocupados en un
    //    momento dado para un estudio ──
    const ocupadosEn = (idEstudio: number, minuto: number): number => {
      const arr = ocupacionPorEstudio.get(idEstudio) ?? [];
      const dur = atencionMap.get(idEstudio) ?? 10;
      return arr.filter(c => c.inicio < minuto + dur && c.fin > minuto).length;
    };

    // ── Generar slots granulares ──
    const aperturaMin = horaApertura * 60;
    // Margen: el paciente debe poder terminar TODOS sus estudios antes del cierre
    const cierreMin = horaCierre * 60 - tiempoAtencionTotal;
    const inicioMin = Math.max(aperturaMin, minutosMinHoy);

    type Slot = {
      date: string; hour: number; time: string;
      waitMin: number; serviceMin: number; totalEstimatedMin: number;
      saturationLevel: 'bajo' | 'medio' | 'alto' | 'critico';
      score: number; reason: string; orderedStudyIds: number[];
      citasRegistradas: number; capacidadLibre: number;
      recommended: boolean; tag: string;
    };
    const allSlots: Slot[] = [];

    for (let minuto = inicioMin; minuto <= cierreMin; minuto += intervalo) {
      // Redondear al intervalo mas cercano hacia arriba
      const m = Math.ceil(minuto / intervalo) * intervalo;
      if (m > cierreMin) break;
      if (allSlots.length > 0 && allSlots[allSlots.length - 1].time === fmtMin(m)) continue;

      // Verificar que TODOS los estudios tengan capacidad en este momento
      // (el primer estudio empieza en m, los siguientes se encadenan)
      let minutoActual = m;
      let todosDisponibles = true;
      let capacidadLibreTotal = 0;
      let citasEnVentana = 0;

      for (const id of ordenOptimo) {
        const cap = capMap.get(id) ?? 1;
        const ocu = ocupadosEn(id, minutoActual);
        const libre = Math.max(0, cap - ocu);
        capacidadLibreTotal += libre;
        citasEnVentana += ocu;
        if (libre <= 0) {
          todosDisponibles = false;
          break;
        }
        // El siguiente estudio empieza despues de que termine este
        minutoActual += atencionMap.get(id) ?? 10;
      }

      if (!todosDisponibles) continue;

      // Prediccion de espera con IA
      const hora = Math.floor(m / 60);
      let esperaTotal = 0;
      let usedIA = false;
      for (const id of ordenOptimo) {
        const colaReal = ocupadosEn(id, m);
        const cap = capMap.get(id) ?? 1;
        try {
          const pred = await this.ai.predict({
            id_sucursal: params.branchId,
            id_estudio: id, hora, dia_semana: dow,
            pacientes_en_cola: colaReal,
            consultorios_activos: cap,
          });
          esperaTotal += pred.tiempo_espera_pred_min;
          usedIA = true;
        } catch {
          const base = esperaMap.get(id) ?? 20;
          esperaTotal += colaReal > 0 ? base * (1 + colaReal * 0.15) : base * 0.5;
        }
      }
      esperaTotal = Math.round(esperaTotal);

      let nivel: 'bajo' | 'medio' | 'alto' | 'critico' = 'bajo';
      if (esperaTotal > 40) nivel = 'critico';
      else if (esperaTotal > 25) nivel = 'alto';
      else if (esperaTotal > 12) nivel = 'medio';

      const razones: string[] = [];
      if (citasEnVentana === 0) razones.push('sin citas');
      else razones.push(`${citasEnVentana} en atencion`);
      razones.push(`${capacidadLibreTotal} consultorios libres`);
      if (hora >= 6 && hora < 8) razones.push('apertura');
      else if (hora >= 10 && hora <= 11) razones.push('media manana');
      else if (hora >= 7 && hora <= 9 && citasEnVentana > 2) razones.push('hora pico');
      if (usedIA) razones.push('IA');

      let tag = '';
      let recommended = false;
      if (citasEnVentana === 0 && nivel === 'bajo') { tag = 'Recomendado'; recommended = true; }
      else if (citasEnVentana <= 2 && (nivel === 'bajo' || nivel === 'medio')) { tag = 'Buena opcion'; }
      else if (nivel === 'alto' || nivel === 'critico') { tag = 'Alta demanda'; }

      const total = esperaTotal + Math.round(tiempoAtencionTotal);
      const nivelMap = { bajo: 0, medio: 0.3, alto: 0.6, critico: 1 };
      const score = (
        0.35 * (esperaTotal / 60) +
        0.25 * (citasEnVentana / Math.max(totalCitasDia + 1, 1)) +
        0.20 * nivelMap[nivel] +
        0.10 * (capacidadLibreTotal <= 0 ? 1 : 0) +
        0.10 * (hora >= 7 && hora <= 9 ? 0.5 : 0)
      );

      allSlots.push({
        date: params.date, hour: hora,
        time: fmtMin(m),
        waitMin: esperaTotal, serviceMin: Math.round(tiempoAtencionTotal),
        totalEstimatedMin: total,
        saturationLevel: nivel,
        score: Math.round(score * 1000) / 1000,
        reason: razones.join(' · '),
        orderedStudyIds: ordenOptimo,
        citasRegistradas: citasEnVentana, capacidadLibre: capacidadLibreTotal,
        recommended, tag,
      });
    }

    // Ordenamiento inteligente:
    // - Si el dia tiene poca carga (< 5 citas), los pacientes quieren ser
    //   atendidos LO ANTES POSIBLE → ordenar por hora (mas temprano primero).
    // - Si hay congestion, el score importa → los horarios con menos espera
    //   y mas capacidad suben al top aunque sean mas tarde.
    if (totalCitasDia < 5) {
      // Dia libre: temprano primero, score como desempate
      allSlots.sort((a, b) => {
        const timeA = parseInt(a.time) * 60 + parseInt(a.time.split(':')[1]);
        const timeB = parseInt(b.time) * 60 + parseInt(b.time.split(':')[1]);
        return timeA - timeB || a.score - b.score;
      });
    } else {
      // Dia con carga: score primero (menor espera gana)
      allSlots.sort((a, b) => a.score - b.score);
    }
    const topSlots = allSlots.slice(0, params.topN);

    // El primer slot del resultado es el "Recomendado" cuando esta libre
    if (topSlots.length > 0 && topSlots[0].citasRegistradas === 0) {
      topSlots[0].tag = 'Recomendado';
      topSlots[0].recommended = true;
    }

    return {
      branchId: params.branchId,
      date: params.date,
      studyIds: params.studyIds,
      slots: topSlots,
      validations: validaciones,
      weeklyHours: { open: horaApertura, close: horaCierre },
      totalCitasDia,
      ordenRecomendado: ordenOptimo,
      intervaloMin: intervalo,
      source: 'smart' as const,
      message: topSlots.length === 0
        ? esHoy
          ? 'Ya no hay horarios disponibles hoy. Elige otro dia.'
          : `Sin horarios disponibles los ${diaNombre}.`
        : undefined,
    };
  }

  /**
   * Walk-in: un paciente llega SIN cita. Encuentra el proximo hueco
   * disponible desde AHORA MISMO.
   *
   * Retorna:
   *   - La hora mas pronto a la que puede ser atendido.
   *   - Cuantas personas hay delante en cada estudio.
   *   - Tiempo estimado total (espera + atencion).
   *   - Recomendacion de si esperar o volver otro dia.
   */
  async walkIn(params: {
    branchId: number;
    studyIds: number[];
  }) {
    if (!params.studyIds.length) {
      throw new BadRequestException('studyIds vacio');
    }

    const hoy = nowCDMX().dateStr;
    const result = await this.availableSlots({
      branchId: params.branchId,
      date: hoy,
      studyIds: params.studyIds,
      topN: 1,
    });

    if (result.slots.length === 0) {
      // No hay hueco hoy, buscar manana
      const mananaDate = new Date();
      mananaDate.setDate(mananaDate.getDate() + 1);
      const mananaStr = mananaDate.toISOString().slice(0, 10);
      const resultManana = await this.availableSlots({
        branchId: params.branchId,
        date: mananaStr,
        studyIds: params.studyIds,
        topN: 1,
      });

      return {
        disponibleHoy: false,
        proximoSlot: resultManana.slots[0] ?? null,
        proximaFecha: mananaStr,
        mensaje: 'No hay espacio disponible hoy. Te recomendamos agendar para manana.',
        validations: resultManana.validations,
        ordenRecomendado: resultManana.ordenRecomendado,
      };
    }

    const slot = result.slots[0];
    const cdmxWI = nowCDMX();
    const ahoraMin = cdmxWI.hours * 60 + cdmxWI.minutes;
    const slotMin = parseInt(slot.time.split(':')[0]) * 60 +
                    parseInt(slot.time.split(':')[1]);
    const esperaDesdeAhora = Math.max(0, slotMin - ahoraMin) + slot.waitMin;

    return {
      disponibleHoy: true,
      proximoSlot: slot,
      proximaFecha: hoy,
      esperaDesdeAhoraMin: esperaDesdeAhora,
      mensaje: esperaDesdeAhora <= 30
        ? `Puedes pasar en ${esperaDesdeAhora} minutos. Tu turno seria a las ${slot.time}.`
        : `El proximo hueco es a las ${slot.time} (~${esperaDesdeAhora} min de espera). Puedes esperar o agendar para otro dia.`,
      validations: result.validations,
      ordenRecomendado: result.ordenRecomendado,
    };
  }

  // 5) Scheduler global de sucursal (in-memory clinic)
  // ──────────────────────────────────────────────
  /**
   * Cuando un paciente hace check-in en sucursal, lo registra en el
   * estado vivo de la clínica y dispara un re-plan global.
   * Devuelve la ETA del paciente y los swaps que el algoritmo aplicó.
   */
  async registerArrivalAndReplan(reservacionId: string) {
    const r = await this.prisma.reservaciones.findUnique({
      where: { id: BigInt(reservacionId) },
      include: { reservaciones_servicios: true },
    });
    if (!r) throw new NotFoundException('Reservación no encontrada');

    const minutosDesdeApertura = (() => {
      const c = nowCDMX();
      // 6:00 AM apertura por defecto
      return c.hours * 60 + c.minutes - 6 * 60;
    })();

    const plan = await this.ai.registerPatient({
      id_sucursal: r.id_sucursal,
      id_paciente: r.id_paciente,
      estudios: r.reservaciones_servicios.map((s) => s.id_estudio),
      prioridad: 'cita',
      hora_llegada_min: Math.max(0, minutosDesdeApertura),
    });

    const yo = plan.pacientes.find((p) => p.id_paciente === r.id_paciente);
    return {
      reservationId: reservacionId,
      branchId: r.id_sucursal,
      eta_min: yo?.espera_total_min ?? null,
      orderedStudyIds: yo?.orden_estudios ?? [],
      schedule: yo?.desglose ?? [],
      averageWaitMin: plan.espera_promedio_total_min,
      swaps: plan.swaps_aplicados,
      reason: plan.motivo,
    };
  }

  /**
   * Cuando un consultorio termina con un paciente, libera el recurso
   * y dispara un re-plan global. El siguiente paciente puede ver una
   * nueva ETA porque otro consultorio podría estar disponible.
   */
  async finishAttentionAndReplan(
    branchId: number,
    patientId: string,
    studyId: number,
  ) {
    return this.ai.finishAttention({
      id_sucursal: branchId,
      id_paciente: patientId,
      id_estudio: studyId,
    });
  }

  async startAttentionAndReplan(
    branchId: number,
    patientId: string,
    studyId: number,
  ) {
    return this.ai.startAttention({
      id_sucursal: branchId,
      id_paciente: patientId,
      id_estudio: studyId,
    });
  }

  async clinicSnapshot(branchId: number) {
    return this.ai.clinicSnapshot(branchId);
  }

  async clinicPlan(branchId: number) {
    return this.ai.clinicPlan(branchId);
  }

  /**
   * Llamado por el módulo de check-in cuando el paciente se registra.
   * Detecta llegada tardía a estudios con puntualidad estricta y dispara
   * reschedule automáticamente. Devuelve null si no hubo reagendamiento.
   */
  async checkLateAndReschedule(reservacionId: string) {
    const r = await this.prisma.reservaciones.findUnique({
      where: { id: BigInt(reservacionId) },
      include: {
        reservaciones_servicios: { include: { estudios: true } },
      },
    });
    if (!r || !r.hora_programada) return null;

    const ESTUDIOS_PUNTUALIDAD_ESTRICTA = new Set([11, 12]); // Tomografía, Resonancia
    const tieneEstricto = r.reservaciones_servicios.some((s) =>
      ESTUDIOS_PUNTUALIDAD_ESTRICTA.has(s.id_estudio),
    );
    if (!tieneEstricto) return null;

    const ahora = new Date();
    const horaCita = new Date(r.fecha_programada);
    horaCita.setUTCHours(
      r.hora_programada.getUTCHours(),
      r.hora_programada.getUTCMinutes(),
      0,
      0,
    );
    const retrasoMin = Math.floor(
      (ahora.getTime() - horaCita.getTime()) / 60000,
    );

    // Tolerancia: 10 minutos
    if (retrasoMin <= 10) return null;

    this.logger.warn(
      `Reservación ${reservacionId} con retraso ${retrasoMin}min en estudio estricto — reagendando`,
    );
    return this.reschedule(reservacionId, {
      reason: 'tarde',
      minutosRetraso: retrasoMin,
      nota: 'Auto-reagendado por puntualidad estricta',
      permitirSiguienteDia: true,
    });
  }
}
