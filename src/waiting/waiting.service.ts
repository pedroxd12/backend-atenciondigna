import { Injectable } from '@nestjs/common';
import { Observable, from, interval, switchMap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { levelFromMinutes, SaturationLevel } from '../common/saturation';

export interface WaitStatus {
  currentStudy: string;
  area: string;
  peopleAhead: number;
  estimatedMinutes: number;
  saturationLevel: SaturationLevel;
  isYourTurn: boolean;
}

@Injectable()
export class WaitingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Estado en vivo del paciente: el siguiente estudio en su lista de
   * `reservaciones_servicios`, cuantas personas tiene delante en la cola y
   * el tiempo estimado.
   */
  async current(patientId: string): Promise<WaitStatus> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const reservacion = await this.prisma.reservaciones.findFirst({
      where: {
        id_paciente: patientId,
        fecha_programada: { gte: today, lt: tomorrow },
        estado: { in: ['pendiente', 'confirmada', 'en_proceso'] },
      },
      include: {
        reservaciones_servicios: {
          where: { estado: { in: ['en_espera', 'llamado'] } },
          include: { estudios: true, sucursales_consultorios: true },
          orderBy: { orden_atencion: 'asc' },
        },
      },
    });

    const srv = reservacion?.reservaciones_servicios[0];
    if (!srv) {
      return {
        currentStudy: 'Sin estudio activo',
        area: '-',
        peopleAhead: 0,
        estimatedMinutes: 0,
        saturationLevel: 'bajo',
        isYourTurn: false,
      };
    }

    // Cuenta cuantas posiciones hay delante de este servicio en la cola
    const myPos = await this.prisma.cola_atencion.findFirst({
      where: { id_reservacion_srv: srv.id, estado: 'activo' },
    });
    const peopleAhead = myPos
      ? Math.max(0, myPos.posicion - 1)
      : (srv.numero_turno ?? 0);

    const tiempo =
      myPos?.tiempo_estimado_min ??
      srv.tiempo_espera_predicho_min ??
      srv.estudios.tiempo_espera_promedio_min;

    return {
      currentStudy: srv.estudios.nombre,
      area: srv.sucursales_consultorios?.area_nombre ?? srv.estudios.nombre,
      peopleAhead,
      estimatedMinutes: tiempo,
      saturationLevel: levelFromMinutes(tiempo),
      isYourTurn: srv.estado === 'llamado' || peopleAhead === 0,
    };
  }

  /** SSE — cada 3s relee el estado del paciente desde la BD. */
  stream(patientId: string): Observable<{ data: WaitStatus }> {
    return interval(3000).pipe(
      switchMap(() =>
        from(this.current(patientId).then((data) => ({ data }))),
      ),
    );
  }
}
