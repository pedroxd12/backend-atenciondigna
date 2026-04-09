import { Injectable, Logger } from '@nestjs/common';
import { Observable, interval, switchMap, from } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { levelFromMinutes, SaturationLevel } from '../common/saturation';
import { NotificationsService } from '../common/notifications.service';

/* ──────────────────────────────────────────────
   Interfaces de respuesta — Tracking tipo "Uber"
   ────────────────────────────────────────────── */

export interface StudyStep {
  id: number;
  name: string;
  area: string;
  status: 'completado' | 'en_proceso' | 'llamado' | 'en_espera' | 'pendiente';
  order: number;
  /** Minutos estimados de espera para ESTE estudio */
  estimatedMinutes: number;
  /** Minutos que tardó la atención (solo si completado) */
  serviceMinutes: number | null;
  /** Folio asignado en la cola */
  folio: string | null;
  /** Personas delante en la cola de este estudio */
  peopleAhead: number;
  /** Tip de preparación para este estudio */
  preparationTip: string | null;
  /** Info educativa sobre el estudio */
  educationalInfo: string | null;
  /** Indicaciones de ubicación dentro de la clínica */
  locationHint: string | null;
}

export interface TrackingStatus {
  /** Datos del paciente */
  patientName: string;
  patientId: string;

  /** Estado general */
  hasActiveVisit: boolean;
  visitStatus: 'sin_visita' | 'registrado' | 'en_proceso' | 'completado';

  /** Progreso (ej: "2 de 4 estudios completados") */
  totalStudies: number;
  completedStudies: number;
  currentStudyIndex: number;
  progressPercent: number;

  /** Estudio actual */
  currentStudy: StudyStep | null;
  /** Siguiente estudio */
  nextStudy: StudyStep | null;
  /** Lista completa de estudios en orden */
  studies: StudyStep[];

  /** ETA global */
  etaTotalMinutes: number;
  etaRemainingMinutes: number;
  saturationLevel: SaturationLevel;

  /** Sucursal */
  branch: {
    id: number;
    name: string;
    address: string;
    lat: number;
    lng: number;
    mapGeoJson: unknown | null;
  } | null;

  /** Mensaje personalizado para el paciente */
  message: string;
  /** Tips contextuales */
  tips: string[];

  /** Timestamp del servidor */
  serverTime: string;
}

/* ──────────────────────────────────────────────
   Contenido educativo y tips por estudio
   ────────────────────────────────────────────── */

const PREPARATION_TIPS: Record<number, string> = {
  1: 'Retire objetos metálicos y joyas. La densitometría es rápida e indolora.',
  2: 'Recuerde mantener su ayuno de 8-12 horas. Si trae muestra de orina, debe tener menos de 2 horas de recolectada.',
  3: 'No use desodorante, talco ni cremas en la zona. Use ropa cómoda de dos piezas.',
  4: 'No use cremas, óvulos ni duchas vaginales 48 horas antes. No debe estar menstruando.',
  5: 'Retire objetos metálicos de la zona a estudiar. El procedimiento es muy rápido.',
  6: 'Para ultrasonido abdominal: ayuno de 6 horas. Para pélvico: vejiga llena (tome 1 litro de agua 1 hora antes).',
  9: 'Evite consumir cafeína 4 horas antes. Descanse unos minutos antes del estudio.',
  11: 'Llegue puntual (su cita se reagenda si llega tarde). Ayuno de 4 horas si es con contraste. Informe alergias.',
  12: 'Sin objetos metálicos. Informe si tiene implantes, marcapasos o claustrofobia. Llegue puntual.',
  16: 'Traiga estudios de laboratorio recientes si los tiene. No requiere preparación especial.',
  24: 'Mismas indicaciones que el Papanicolaou. Se toma en conjunto.',
  38: 'Evite usar lentes de contacto 24 horas antes del examen.',
  52: 'No requiere preparación especial. Traiga estudios previos si los tiene.',
  56: 'No use duchas vaginales ni cremas 48 horas antes.',
};

const EDUCATIONAL_INFO: Record<number, string> = {
  1: 'La densitometría ósea mide la densidad mineral de sus huesos. Es clave para detectar osteoporosis. Duración aprox: 12 min.',
  2: 'Los análisis de laboratorio nos dan información vital sobre su salud. Los resultados estarán disponibles en la app. Duración aprox: 5 min.',
  3: 'La mastografía es el estudio más efectivo para detección temprana de cáncer de mama. Se recomienda anualmente a partir de los 40 años. Duración aprox: 8 min.',
  4: 'El Papanicolaou detecta cambios celulares en el cuello uterino. Es fundamental para la prevención del cáncer cervicouterino. Duración aprox: 8 min.',
  5: 'Los Rayos X permiten visualizar estructuras internas del cuerpo. La radiación es mínima y el proceso es muy rápido. Duración aprox: 10 min.',
  6: 'El ultrasonido usa ondas sonoras para crear imágenes de órganos internos. Es seguro y no invasivo. Duración aprox: 15 min.',
  9: 'El electrocardiograma registra la actividad eléctrica de su corazón. Es rápido, indoloro y muy informativo. Duración aprox: 7 min.',
  11: 'La tomografía genera imágenes detalladas por cortes del cuerpo. Es más precisa que los Rayos X convencionales. Duración aprox: 20 min.',
  12: 'La resonancia magnética usa campos magnéticos para crear imágenes muy detalladas sin radiación. Duración aprox: 30 min.',
  16: 'La consulta de nutrición le ayudará a establecer un plan alimenticio personalizado basado en sus estudios. Duración aprox: 15 min.',
  24: 'La prueba de VPH detecta el virus del papiloma humano, principal factor de riesgo de cáncer cervicouterino. Duración aprox: 5 min.',
  38: 'El examen de la vista evalúa su agudeza visual y salud ocular general. Duración aprox: 12 min.',
  52: 'La consulta general le permite una revisión completa con un médico. Traiga sus estudios previos. Duración aprox: 15 min.',
  56: 'El cultivo vaginal identifica infecciones bacterianas o por hongos. Los resultados tardan unos días. Duración aprox: 5 min.',
};

const LOCATION_HINTS: Record<number, string> = {
  1: 'Área de Densitometría — Planta baja, pasillo izquierdo',
  2: 'Área de Laboratorio — Planta baja, primer módulo a la derecha',
  3: 'Área de Mastografía — Planta baja, sección de imagenología',
  4: 'Área de Papanicolaou — Planta baja, consultorio ginecológico',
  5: 'Área de Rayos X — Planta baja, sección de imagenología',
  6: 'Área de Ultrasonido — Planta baja, sección de imagenología',
  9: 'Área de Electrocardiograma — Planta baja, consultorio de cardiología',
  11: 'Área de Tomografía — Planta baja, fondo del pasillo de imagenología',
  12: 'Área de Resonancia Magnética — Planta baja, fondo del pasillo de imagenología',
  16: 'Área de Nutrición — Segundo piso, consultorio 3',
  24: 'Área de VPH — Planta baja, consultorio ginecológico',
  38: 'Área de Óptica — Planta baja, junto a recepción',
  52: 'Consultorio de Medicina General — Segundo piso',
  56: 'Área de Cultivo — Planta baja, consultorio ginecológico',
};

/* ──────────────────────────────────────────────
   Mensajes contextuales
   ────────────────────────────────────────────── */

function buildMessage(status: Omit<TrackingStatus, 'message' | 'tips' | 'serverTime'>): string {
  if (!status.hasActiveVisit) {
    return 'No tienes una visita activa. Agenda una cita o haz check-in en recepción.';
  }
  if (status.visitStatus === 'completado') {
    return '¡Todos tus estudios han sido completados! Recuerda contestar la encuesta de satisfacción.';
  }
  if (status.currentStudy?.status === 'llamado') {
    return `¡Es tu turno! Dirígete a ${status.currentStudy.area} para tu ${status.currentStudy.name}.`;
  }
  if (status.currentStudy?.status === 'en_proceso') {
    return `Tu ${status.currentStudy.name} está en proceso. Relájate, estás en buenas manos.`;
  }
  if (status.currentStudy && status.currentStudy.peopleAhead <= 1) {
    return `¡Casi es tu turno para ${status.currentStudy.name}! Prepárate, solo ${status.currentStudy.peopleAhead} persona(s) antes que tú.`;
  }
  if (status.currentStudy) {
    return `Estás esperando para ${status.currentStudy.name}. ${status.currentStudy.peopleAhead} persona(s) antes que tú. Tiempo estimado: ~${status.currentStudy.estimatedMinutes} min.`;
  }
  return 'Tu visita está en curso. Consulta el detalle de tus estudios abajo.';
}

function buildTips(status: Omit<TrackingStatus, 'message' | 'tips' | 'serverTime'>): string[] {
  const tips: string[] = [];

  // Tip de preparación del siguiente estudio
  if (status.nextStudy?.preparationTip) {
    tips.push(`Prepárate para tu siguiente estudio (${status.nextStudy.name}): ${status.nextStudy.preparationTip}`);
  }

  // Tip de ubicación del estudio actual
  if (status.currentStudy?.locationHint && status.currentStudy.status !== 'en_proceso') {
    tips.push(`Dirígete a: ${status.currentStudy.locationHint}`);
  }

  // Tip de tiempo libre si hay espera larga
  if (status.etaRemainingMinutes > 30) {
    tips.push('Tienes tiempo de espera. Puedes revisar tus resultados anteriores o explorar la sección de servicios en la app.');
  }

  // Tip post-visita
  if (status.completedStudies > 0 && status.completedStudies === status.totalStudies) {
    tips.push('Tus resultados estarán disponibles en la sección "Resultados" de la app. Te notificaremos cuando estén listos.');
  }

  return tips;
}

/* ──────────────────────────────────────────────
   Servicio
   ────────────────────────────────────────────── */

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);
  private readonly notifiedTurns = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private formatFolio(n: number): string {
    return `A${String(n).padStart(4, '0')}`;
  }

  /**
   * Estado completo del trayecto del paciente — endpoint principal del
   * tracking tipo "Uber".
   */
  async getTrackingStatus(patientId: string): Promise<TrackingStatus> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Buscar la reservación activa de hoy
    const reservacion = await this.prisma.reservaciones.findFirst({
      where: {
        id_paciente: patientId,
        fecha_programada: { gte: today, lt: tomorrow },
        estado: { in: ['pendiente', 'confirmada', 'en_proceso'] },
      },
      include: {
        pacientes: true,
        sucursales: true,
        reservaciones_servicios: {
          include: {
            estudios: true,
            sucursales_consultorios: true,
          },
          orderBy: { orden_atencion: 'asc' },
        },
      },
    });

    // Si también hay reservaciones completadas hoy, buscarlas
    const completedReservacion = !reservacion
      ? await this.prisma.reservaciones.findFirst({
          where: {
            id_paciente: patientId,
            fecha_programada: { gte: today, lt: tomorrow },
            estado: 'completada',
          },
          include: {
            pacientes: true,
            sucursales: true,
            reservaciones_servicios: {
              include: { estudios: true, sucursales_consultorios: true },
              orderBy: { orden_atencion: 'asc' },
            },
          },
        })
      : null;

    const activeRes = reservacion ?? completedReservacion;

    if (!activeRes) {
      // Buscar paciente para nombre
      const paciente = await this.prisma.pacientes.findUnique({
        where: { id: patientId },
      });
      return this.emptyStatus(
        patientId,
        paciente
          ? [paciente.nombre, paciente.apellido_paterno].filter(Boolean).join(' ')
          : '',
      );
    }

    const paciente = activeRes.pacientes;
    const sucursal = activeRes.sucursales;
    const servicios = activeRes.reservaciones_servicios;
    const patientName = [paciente.nombre, paciente.apellido_paterno]
      .filter(Boolean)
      .join(' ');

    // Construir StudySteps
    const studies: StudyStep[] = [];
    for (const srv of servicios) {
      // Buscar posición en la cola
      const colaEntry = await this.prisma.cola_atencion.findFirst({
        where: { id_reservacion_srv: srv.id, estado: { in: ['activo', 'llamado'] } },
      });

      const peopleAhead = colaEntry
        ? Math.max(0, colaEntry.posicion - 1)
        : 0;

      const idEstudio = srv.id_estudio;
      const estimatedMin =
        colaEntry?.tiempo_estimado_min ??
        srv.tiempo_espera_predicho_min ??
        srv.estudios.tiempo_espera_promedio_min;

      let status: StudyStep['status'];
      if (srv.estado === 'completado') status = 'completado';
      else if (srv.estado === 'en_proceso') status = 'en_proceso';
      else if (srv.estado === 'llamado' || colaEntry?.estado === 'llamado') status = 'llamado';
      else if (colaEntry) status = 'en_espera';
      else status = 'pendiente';

      let serviceMinutes: number | null = null;
      if (srv.hora_inicio_atencion && srv.hora_fin_atencion) {
        serviceMinutes = Math.round(
          (new Date(srv.hora_fin_atencion).getTime() -
            new Date(srv.hora_inicio_atencion).getTime()) /
            60000,
        );
      }

      studies.push({
        id: idEstudio,
        name: srv.estudios.nombre,
        area: srv.sucursales_consultorios?.area_nombre ?? srv.estudios.nombre,
        status,
        order: srv.orden_atencion,
        estimatedMinutes: estimatedMin,
        serviceMinutes,
        folio:
          srv.numero_turno != null ? this.formatFolio(srv.numero_turno) : null,
        peopleAhead,
        preparationTip: PREPARATION_TIPS[idEstudio] ?? null,
        educationalInfo: EDUCATIONAL_INFO[idEstudio] ?? null,
        locationHint: LOCATION_HINTS[idEstudio] ?? null,
      });
    }

    const totalStudies = studies.length;
    const completedStudies = studies.filter((s) => s.status === 'completado').length;
    const currentStudy =
      studies.find((s) => s.status === 'en_proceso') ??
      studies.find((s) => s.status === 'llamado') ??
      studies.find((s) => s.status === 'en_espera') ??
      null;
    const currentStudyIndex = currentStudy
      ? studies.indexOf(currentStudy)
      : totalStudies;
    const nextStudy =
      currentStudy
        ? studies.find(
            (s) =>
              s.order > currentStudy.order &&
              s.status !== 'completado' &&
              s !== currentStudy,
          ) ?? null
        : null;

    const progressPercent =
      totalStudies > 0
        ? Math.round((completedStudies / totalStudies) * 100)
        : 0;

    // ETA: suma de estimados de estudios pendientes
    const etaTotalMinutes = studies.reduce(
      (acc, s) => acc + s.estimatedMinutes,
      0,
    );
    const etaRemainingMinutes = studies
      .filter((s) => s.status !== 'completado')
      .reduce((acc, s) => acc + s.estimatedMinutes, 0);

    const isCompleted = completedStudies === totalStudies && totalStudies > 0;
    const hasCheckedIn = activeRes.checkin_at != null;
    const visitStatus = isCompleted
      ? 'completado'
      : hasCheckedIn
        ? 'en_proceso'
        : 'registrado';

    const branch = sucursal
      ? {
          id: sucursal.id,
          name: sucursal.nombre,
          address: sucursal.direccion ?? '',
          lat: Number(sucursal.latitud ?? 0),
          lng: Number(sucursal.longitud ?? 0),
          mapGeoJson: sucursal.mapa_geojson ?? null,
        }
      : null;

    const partialStatus = {
      patientName,
      patientId,
      hasActiveVisit: true,
      visitStatus: visitStatus as TrackingStatus['visitStatus'],
      totalStudies,
      completedStudies,
      currentStudyIndex,
      progressPercent,
      currentStudy,
      nextStudy,
      studies,
      etaTotalMinutes,
      etaRemainingMinutes,
      saturationLevel: levelFromMinutes(
        currentStudy?.estimatedMinutes ?? etaRemainingMinutes,
      ),
      branch,
    };

    // Push notification si es su turno
    if (currentStudy?.status === 'llamado') {
      const key = `${patientId}:${currentStudy.name}`;
      if (!this.notifiedTurns.has(key)) {
        this.notifiedTurns.add(key);
        this.notifications
          .notifyTurnReady(patientId, currentStudy.area)
          .catch(() => {});
      }
    }

    return {
      ...partialStatus,
      message: buildMessage(partialStatus),
      tips: buildTips(partialStatus),
      serverTime: new Date().toISOString(),
    };
  }

  private emptyStatus(patientId: string, patientName: string): TrackingStatus {
    return {
      patientName,
      patientId,
      hasActiveVisit: false,
      visitStatus: 'sin_visita',
      totalStudies: 0,
      completedStudies: 0,
      currentStudyIndex: 0,
      progressPercent: 0,
      currentStudy: null,
      nextStudy: null,
      studies: [],
      etaTotalMinutes: 0,
      etaRemainingMinutes: 0,
      saturationLevel: 'bajo',
      branch: null,
      message: 'No tienes una visita activa. Agenda una cita o haz check-in en recepción.',
      tips: [],
      serverTime: new Date().toISOString(),
    };
  }

  /** SSE — polling cada 10 segundos para tracking tipo Uber */
  stream(patientId: string): Observable<{ data: TrackingStatus }> {
    return interval(10_000).pipe(
      switchMap(() => from(this.getTrackingStatus(patientId))),
      switchMap((data) => from(Promise.resolve({ data }))),
    );
  }
}
