import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface CheckinPass {
  token: string;
  reservationId: string;
  patientId: string;
  branchId: number;
  studyIds: number[];
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

  constructor(private readonly prisma: PrismaService) {}

  async generatePass(input: {
    patientId: string;
    branchId: number;
    studyIds?: number[];
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

    const token = `tk_${randomBytes(8).toString('hex')}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000);

    const pass: CheckinPass = {
      token,
      reservationId: reservacion.id.toString(),
      patientId: input.patientId,
      branchId: input.branchId,
      studyIds,
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

    await this.prisma.reservaciones.update({
      where: { id: BigInt(pass.reservationId) },
      data: {
        checkin_at: new Date(),
        checkin_tipo: 'qr',
        estado: 'en_proceso',
      },
    });

    // Encolar todos los servicios de la reservacion
    const servicios = await this.prisma.reservaciones_servicios.findMany({
      where: { id_reservacion: BigInt(pass.reservationId) },
    });
    await Promise.all(
      servicios.map(async (srv) => {
        const last = await this.prisma.cola_atencion.findFirst({
          where: {
            id_sucursal: srv.id_sucursal,
            id_estudio: srv.id_estudio,
            estado: 'activo',
          },
          orderBy: { posicion: 'desc' },
        });
        const nextPos = (last?.posicion ?? 0) + 1;
        await this.prisma.cola_atencion.create({
          data: {
            id_sucursal: srv.id_sucursal,
            id_estudio: srv.id_estudio,
            id_reservacion_srv: srv.id,
            posicion: nextPos,
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
  }): Promise<ClinicalValidation> {
    const estudios = await this.prisma.estudios.findMany({
      where: { id: { in: input.studyIds } },
    });

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

    return { status: 'ok', message: 'Validacion clinica completada.' };
  }
}
