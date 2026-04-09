import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulingService } from '../appointments/scheduling.service';
import { AiService } from '../ai/ai.service';

export type PatientPriority = 'urgente' | 'cita' | 'sin_cita';

export interface CheckinPass {
  token: string;
  reservationId: string;
  patientId: string;
  branchId: number;
  studyIds: number[];
  prioridad: PatientPriority;
  issuedAt: string;
  expiresAt: string;
  qrPayload: string;
}

export interface ClinicalValidation {
  status: 'ok' | 'requires_medical_order' | 'sample_expired';
  message: string;
}

@Injectable()
export class CheckinService {
  /**
   * Tokens en memoria — el "lado del receptor" canjea con `redeemPass`.
   * En produccion: tabla `checkin_tokens` con TTL en Redis.
   */
  private readonly tokens = new Map<string, CheckinPass>();
  private readonly logger = new Logger(CheckinService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduling: SchedulingService,
    private readonly ai: AiService,
  ) {}

  async generatePass(input: {
    patientId: string;
    branchId: number;
    studyIds?: number[];
    prioridad?: PatientPriority;
  }): Promise<CheckinPass> {
    // 1. Busca la reservacion activa de hoy en esa sucursal
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const reservacion = await this.prisma.reservaciones.findFirst({
      where: {
        id_paciente: input.patientId,
        id_sucursal: input.branchId,
        fecha_programada: { gte: today, lt: tomorrow },
      },
      include: { reservaciones_servicios: true },
      orderBy: { hora_programada: 'asc' },
    });

    if (!reservacion) {
      throw new NotFoundException(
        'No hay reservacion para hoy en esta sucursal',
      );
    }

    const studyIds =
      input.studyIds && input.studyIds.length > 0
        ? input.studyIds
        : reservacion.reservaciones_servicios.map((s) => s.id_estudio);

    const prioridad: PatientPriority = input.prioridad ?? 'cita';
    const token = `tk_${randomBytes(8).toString('hex')}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000);

    const pass: CheckinPass = {
      token,
      reservationId: reservacion.id.toString(),
      patientId: input.patientId,
      branchId: input.branchId,
      studyIds,
      prioridad,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      qrPayload: `AD|${token}|${input.patientId}|${input.branchId}|${studyIds.join(',')}`,
    };

    this.tokens.set(token, pass);
    return pass;
  }

  /** El receptor escanea el QR — marcamos la reservacion como `en_proceso`. */
  async redeemPass(token: string): Promise<CheckinPass> {
    const pass = this.tokens.get(token);
    if (!pass) throw new NotFoundException('Pase no encontrado');
    if (new Date(pass.expiresAt) < new Date()) {
      throw new BadRequestException('Pase expirado');
    }

    // Auto-detección de tardanza para estudios de puntualidad estricta:
    // Tomografía/Resonancia. Si aplica, se reagenda y se aborta el check-in.
    try {
      const reagendado = await this.scheduling.checkLateAndReschedule(
        pass.reservationId,
      );
      if (reagendado) {
        this.tokens.delete(token);
        throw new BadRequestException(
          `Tu cita fue reagendada automáticamente para ${reagendado.newDate} a las ${reagendado.newTime}: ${reagendado.reason}`,
        );
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      this.logger.warn(`checkLateAndReschedule falló: ${(e as Error).message}`);
    }

    await this.prisma.reservaciones.update({
      where: { id: BigInt(pass.reservationId) },
      data: {
        checkin_at: new Date(),
        checkin_tipo: 'qr',
        estado: 'en_proceso',
      },
    });

    // Encolar todos los servicios de la reservacion con prioridad
    const prioridadOrden: Record<string, number> = {
      urgente: 0,
      cita: 1,
      sin_cita: 2,
    };
    const prioridadNum = prioridadOrden[pass.prioridad] ?? 1;

    const servicios = await this.prisma.reservaciones_servicios.findMany({
      where: { id_reservacion: BigInt(pass.reservationId) },
    });
    await Promise.all(
      servicios.map(async (srv) => {
        // Para pacientes urgentes, insertar delante de los de menor prioridad
        let nextPos: number;
        if (pass.prioridad === 'urgente') {
          // Insertar después del último urgente (o al inicio)
          const lastUrgent = await this.prisma.cola_atencion.findFirst({
            where: {
              id_sucursal: srv.id_sucursal,
              id_estudio: srv.id_estudio,
              estado: 'activo',
              prioridad: 'urgente',
            },
            orderBy: { posicion: 'desc' },
          });
          nextPos = (lastUrgent?.posicion ?? 0) + 1;
          // Desplazar posiciones de los que están después
          await this.prisma.$executeRawUnsafe(
            `UPDATE cola_atencion SET posicion = posicion + 1
             WHERE id_sucursal = $1 AND id_estudio = $2
             AND estado = 'activo' AND posicion >= $3`,
            srv.id_sucursal,
            srv.id_estudio,
            nextPos,
          );
        } else {
          const last = await this.prisma.cola_atencion.findFirst({
            where: {
              id_sucursal: srv.id_sucursal,
              id_estudio: srv.id_estudio,
              estado: 'activo',
            },
            orderBy: { posicion: 'desc' },
          });
          nextPos = (last?.posicion ?? 0) + 1;
        }

        await this.prisma.cola_atencion.create({
          data: {
            id_sucursal: srv.id_sucursal,
            id_estudio: srv.id_estudio,
            id_reservacion_srv: srv.id,
            posicion: nextPos,
            prioridad: pass.prioridad,
            estado: 'activo',
            tiempo_estimado_min: srv.tiempo_espera_predicho_min ?? null,
          },
        });
        await this.prisma.reservaciones_servicios.update({
          where: { id: srv.id },
          data: {
            hora_inicio_espera: new Date(),
            numero_turno: nextPos,
          },
        });
      }),
    );

    // GAP 2: Registrar paciente en el scheduler IA para que el GlobalPlan
    // refleje la cola real y calcule ETAs correctos.
    try {
      const now = new Date();
      const horaLlegadaMin =
        (now.getHours() - 7) * 60 + now.getMinutes(); // minutos desde apertura (7am)
      await this.ai.registerPatient({
        id_sucursal: pass.branchId,
        id_paciente: pass.patientId,
        estudios: pass.studyIds,
        prioridad: pass.prioridad,
        hora_llegada_min: Math.max(0, horaLlegadaMin),
      });
    } catch (e) {
      this.logger.warn(
        `No se pudo registrar en scheduler IA: ${(e as Error).message}`,
      );
    }

    this.tokens.delete(token);
    return pass;
  }

  /**
   * Valida reglas clinicas leyendo el catalogo `estudios`:
   *   - Estudios con `requiere_orden_medica = true` necesitan que el paciente
   *     marque que la subio.
   *   - Si hay laboratorio (max_vigencia_muestra_min definido) y `sampleCollectedAt`
   *     supera ese limite, se rechaza.
   */
  async validateClinicalRules(input: {
    studyIds: number[];
    hasMedicalOrder: boolean;
    sampleCollectedAt?: string;
    patientId?: string;
  }): Promise<ClinicalValidation> {
    const estudios = await this.prisma.estudios.findMany({
      where: { id: { in: input.studyIds } },
    });

    // GAP 4: Validar restricciones de edad desde la tabla estudios_restricciones_edad
    if (input.patientId) {
      const paciente = await this.prisma.pacientes.findUnique({
        where: { id: input.patientId },
      });
      if (paciente?.fecha_nacimiento) {
        const edadMs = Date.now() - new Date(paciente.fecha_nacimiento).getTime();
        const edad = Math.floor(edadMs / (365.25 * 24 * 3600 * 1000));

        const restricciones =
          await this.prisma.estudios_restricciones_edad.findMany({
            where: { id_estudio: { in: input.studyIds } },
            include: { estudios: true },
          });

        for (const r of restricciones) {
          if (r.edad_minima != null && edad < r.edad_minima) {
            if (r.requiere_orden_medica && !input.hasMedicalOrder) {
              return {
                status: 'requires_medical_order',
                message: `${r.estudios.nombre}: paciente de ${edad} años (minimo ${r.edad_minima}). Requiere orden medica.`,
              };
            }
          }
          if (r.edad_maxima != null && edad > r.edad_maxima) {
            return {
              status: 'requires_medical_order',
              message: `${r.estudios.nombre}: paciente de ${edad} años excede el maximo de ${r.edad_maxima} años.`,
            };
          }
        }
      }
    }

    const needsOrder = estudios.some((e) => e.requiere_orden_medica);
    if (needsOrder && !input.hasMedicalOrder) {
      return {
        status: 'requires_medical_order',
        message:
          'Uno o mas estudios requieren orden medica. Subela antes de continuar.',
      };
    }

    if (input.sampleCollectedAt) {
      const ageMin =
        (Date.now() - new Date(input.sampleCollectedAt).getTime()) / 60000;
      const limites = estudios
        .map((e) => e.max_vigencia_muestra_min)
        .filter((n): n is number => n != null);
      const minLimite = limites.length > 0 ? Math.min(...limites) : null;
      if (minLimite != null && ageMin > minLimite) {
        return {
          status: 'sample_expired',
          message: `Tu muestra supera los ${minLimite} minutos permitidos. Recolecta una nueva.`,
        };
      }
    }

    // GAP 10: Validar secuencias obligatorias (ej: Papanicolaou antes de Cultivo vaginal)
    const secuencias = await this.prisma.estudios_secuencias.findMany({
      where: {
        OR: [
          { id_estudio_primero: { in: input.studyIds } },
          { id_estudio_segundo: { in: input.studyIds } },
        ],
      },
    });
    for (const seq of secuencias) {
      const hasPrimero = input.studyIds.includes(seq.id_estudio_primero);
      const hasSegundo = input.studyIds.includes(seq.id_estudio_segundo);
      if (hasPrimero && hasSegundo) {
        // Ambos estudios están en el paquete — la secuencia será respetada
        // por el scheduler. Solo informamos al paciente.
        this.logger.log(
          `Secuencia detectada: estudio ${seq.id_estudio_primero} debe ir antes de ${seq.id_estudio_segundo}`,
        );
      }
    }

    return { status: 'ok', message: 'Validacion clinica completada.' };
  }
}
