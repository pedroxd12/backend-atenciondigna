import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Observable, from, interval, switchMap, distinctUntilChanged } from 'rxjs';
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
    extras?: { prioridad?: 'urgente' | 'cita' | 'sin_cita' } & Partial<PacienteContext>,
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
      time: reservacion.hora_programada
        ?.toISOString()
        .substring(11, 16),
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
      fecha_actual: reservacion.fecha_programada
        .toISOString()
        .substring(0, 10),
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
        const consultoriosCount = await this.prisma.sucursales_consultorios.findFirst({
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

    const ahora = new Date();
    const reorder: DynamicReorderResponse = await this.ai.dynamicReorder({
      id_sucursal: reservacion.id_sucursal,
      hora: ahora.getHours(),
      dia_semana: (ahora.getDay() + 6) % 7, // JS: Dom=0; modelo: Lun=0
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
  // 4) Auto-detect tardanza y reagendar (para checkin)
  // ──────────────────────────────────────────────
  // ──────────────────────────────────────────────
  // 4.5) Slots disponibles para la app (lista de horarios)
  // ──────────────────────────────────────────────
  /**
   * Devuelve los horarios candidatos del dia (top N) para que el paciente
   * elija. Cada slot ya tiene tiempo total estimado, orden recomendado,
   * nivel de saturacion y "razon" (por que es buen slot).
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

    // Resolver horario para el dia de la semana del request.
    // 0 = Lunes ... 6 = Domingo (mismo encoding que el modelo Python).
    const fechaObj = new Date(`${params.date}T00:00:00`);
    const jsDow = fechaObj.getDay(); // 0=Dom...6=Sab en JS
    const dow = (jsDow + 6) % 7; // a 0=Lun...6=Dom

    const horarioJson = sucursal.horario_semanal as
      | Record<string, { open: number; close: number }>
      | null
      | undefined;
    let horaApertura: number;
    let horaCierre: number;
    if (horarioJson && horarioJson[String(dow)]) {
      horaApertura = horarioJson[String(dow)].open;
      horaCierre = horarioJson[String(dow)].close;
    } else {
      horaApertura = this.hourFromTime(sucursal.hora_apertura) ?? 7;
      horaCierre = this.hourFromTime(sucursal.hora_cierre) ?? 20;
    }

    if (horaApertura >= horaCierre) {
      // Sucursal cerrada ese dia
      return {
        branchId: params.branchId,
        date: params.date,
        studyIds: params.studyIds,
        slots: [],
        validations: [],
        message: 'La sucursal no abre este dia',
        weeklyHours: { open: horaApertura, close: horaCierre },
      };
    }

    // Tiempos de atencion REALES del catalogo (BD).
    // El modelo IA solo predice tiempo de ESPERA. El total que ve el
    // paciente debe ser: espera + atencion.
    const estudios = await this.prisma.estudios.findMany({
      where: { id: { in: params.studyIds } },
      select: { id: true, tiempo_atencion_promedio_min: true },
    });
    const atencionPorEstudio = new Map<number, number>(
      estudios.map((e) => [e.id, e.tiempo_atencion_promedio_min ?? 10]),
    );
    const tiempoAtencionTotal = params.studyIds.reduce(
      (acc, id) => acc + (atencionPorEstudio.get(id) ?? 10),
      0,
    );

    // Tiempo de espera HISTORICO promedio de los estudios (BD)
    const estudiosFull = await this.prisma.estudios.findMany({
      where: { id: { in: params.studyIds } },
      select: {
        id: true,
        tiempo_atencion_promedio_min: true,
        tiempo_espera_promedio_min: true,
      },
    });
    const esperaHistTotal = estudiosFull.reduce(
      (acc, e) => acc + (e.tiempo_espera_promedio_min ?? 20),
      0,
    );

    // 1) INTENTAR el modelo IA. Si responde, usamos sus slots.
    try {
      const propuesta = await this.ai.optimalSlot({
        id_sucursal: params.branchId,
        fecha: params.date,
        estudios: params.studyIds,
        hora_apertura: horaApertura,
        hora_cierre: horaCierre,
        duracion_estimada_min: Math.max(45, tiempoAtencionTotal + 30),
        top_n: params.topN,
      });
      return {
        branchId: params.branchId,
        date: params.date,
        studyIds: params.studyIds,
        slots: propuesta.slots.map((s) => {
          const espera = Math.round(s.tiempo_total_estimado_min);
          const atencion = Math.round(tiempoAtencionTotal);
          return {
            date: s.fecha,
            hour: s.hora,
            time: `${String(s.hora).padStart(2, '0')}:00`,
            waitMin: espera,
            serviceMin: atencion,
            totalEstimatedMin: espera + atencion,
            saturationLevel: s.nivel_saturacion_promedio,
            score: s.score,
            reason: s.razon,
            orderedStudyIds: s.orden_recomendado,
          };
        }),
        validations: propuesta.validaciones,
        weeklyHours: { open: horaApertura, close: horaCierre },
        source: 'ai' as const,
      };
    } catch (e) {
      this.logger.warn(
        `IA caida para slots ${params.branchId}/${params.date}: ${
          e instanceof Error ? e.message : String(e)
        } — fallback a heuristica BD.`,
      );
    }

    // 2) FALLBACK heuristico SIN modelo IA: generamos slots por hora,
    //    asignamos saturacion segun la franja del dia y devolvemos tiempos
    //    historicos de la BD. Asi la app NUNCA se queda sin horarios.
    const slots = this.generarSlotsHeuristicos({
      fecha: params.date,
      horaApertura,
      horaCierre,
      esperaHistTotal,
      atencionTotal: Math.round(tiempoAtencionTotal),
      studyIds: params.studyIds,
      topN: params.topN,
      duracionEstimadaMin: Math.max(45, tiempoAtencionTotal + 30),
    });

    return {
      branchId: params.branchId,
      date: params.date,
      studyIds: params.studyIds,
      slots,
      validations: [],
      weeklyHours: { open: horaApertura, close: horaCierre },
      source: 'historical' as const,
    };
  }

  /**
   * Genera slots horarios usando solo datos historicos de la BD.
   * Penaliza horas pico (mañana 7-9, mediodia 12-14) sumando ~30% de
   * espera extra; horas valle reducen 30%. Devuelve los topN ordenados
   * por menor tiempo total estimado.
   */
  private generarSlotsHeuristicos(opts: {
    fecha: string;
    horaApertura: number;
    horaCierre: number;
    esperaHistTotal: number;
    atencionTotal: number;
    studyIds: number[];
    topN: number;
    duracionEstimadaMin: number;
  }) {
    const margenHoras = Math.max(1, Math.ceil(opts.duracionEstimadaMin / 60));
    const horaMax = Math.max(opts.horaApertura + 1, opts.horaCierre - margenHoras);
    const slots: Array<{
      date: string;
      hour: number;
      time: string;
      waitMin: number;
      serviceMin: number;
      totalEstimatedMin: number;
      saturationLevel: 'bajo' | 'medio' | 'alto' | 'critico';
      score: number;
      reason: string;
      orderedStudyIds: number[];
    }> = [];

    for (let hora = opts.horaApertura; hora <= horaMax; hora++) {
      // Multiplicador de saturacion historica: pico = mas espera.
      let mult = 1.0;
      let razon = 'horario tranquilo';
      if (hora >= 7 && hora <= 9) {
        mult = 1.35;
        razon = 'hora pico mañana';
      } else if (hora >= 12 && hora <= 14) {
        mult = 1.2;
        razon = 'mediodia ocupado';
      } else if (hora >= 16 && hora <= 18) {
        mult = 1.1;
        razon = 'tarde con afluencia';
      } else if (hora >= 6 && hora < 7) {
        mult = 0.7;
        razon = 'apertura, sin gente';
      } else if (hora === 10 || hora === 11) {
        mult = 0.85;
        razon = 'media manana, ideal';
      } else if (hora >= 15 && hora < 16) {
        mult = 0.85;
        razon = 'inicio tarde';
      }

      const espera = Math.round(opts.esperaHistTotal * mult);
      const total = espera + opts.atencionTotal;

      let nivel: 'bajo' | 'medio' | 'alto' | 'critico' = 'bajo';
      if (espera > 35) nivel = 'critico';
      else if (espera > 25) nivel = 'alto';
      else if (espera > 15) nivel = 'medio';

      slots.push({
        date: opts.fecha,
        hour: hora,
        time: `${String(hora).padStart(2, '0')}:00`,
        waitMin: espera,
        serviceMin: opts.atencionTotal,
        totalEstimatedMin: total,
        saturationLevel: nivel,
        score: total / 200, // pseudo-score normalizado
        reason: razon,
        orderedStudyIds: opts.studyIds,
      });
    }

    slots.sort((a, b) => a.totalEstimatedMin - b.totalEstimatedMin);
    return slots.slice(0, opts.topN);
  }

  // ──────────────────────────────────────────────
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
      const ahora = new Date();
      // 7:00 AM apertura por defecto
      return ahora.getHours() * 60 + ahora.getMinutes() - 7 * 60;
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
