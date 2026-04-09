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
  /** Folio asignado al check-in (null si aun no hay turno). */
  folio: string | null;
  /** Servicio activo del paciente (null si no tiene cita activa). */
  hasActiveService: boolean;
  /** Datos de la sucursal donde tiene la cita activa. */
  branch: {
    id: number;
    name: string;
    address: string;
    lat: number;
    lng: number;
  } | null;
}

export interface QueueItem {
  /** Iniciales del paciente para preservar privacidad. */
  initials: string;
  /** Folio asignado al check-in. */
  folio: string;
  estudio: string;
  posicion: number;
  isCurrent: boolean;
  isMine: boolean;
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
        sucursales: true,
        reservaciones_servicios: {
          where: { estado: { in: ['en_espera', 'llamado'] } },
          include: { estudios: true, sucursales_consultorios: true },
          orderBy: { orden_atencion: 'asc' },
        },
      },
    });

    const srv = reservacion?.reservaciones_servicios[0];
    if (!srv || !reservacion) {
      return {
        currentStudy: '',
        area: '',
        peopleAhead: 0,
        estimatedMinutes: 0,
        saturationLevel: 'bajo',
        isYourTurn: false,
        folio: null,
        hasActiveService: false,
        branch: null,
      };
    }

    const sucursal = reservacion.sucursales;
    const branch = sucursal
      ? {
          id: sucursal.id,
          name: sucursal.nombre,
          address: sucursal.direccion ?? '',
          lat: Number(sucursal.latitud ?? 0),
          lng: Number(sucursal.longitud ?? 0),
        }
      : null;

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
      folio: srv.numero_turno != null ? this.formatFolio(srv.numero_turno) : null,
      hasActiveService: true,
      branch,
    };
  }

  /**
   * Lista los pacientes presentes en la cola del estudio actual del paciente,
   * en su sucursal. Devuelve solo iniciales para no exponer datos personales.
   * Si el paciente no tiene cita activa, regresa una lista vacia (la app
   * muestra estado vacio en lugar de inventar nombres).
   */
  async queueForPatient(patientId: string): Promise<QueueItem[]> {
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
          include: { estudios: true },
          orderBy: { orden_atencion: 'asc' },
        },
      },
    });

    const srv = reservacion?.reservaciones_servicios[0];
    if (!srv) return [];

    const cola = await this.prisma.cola_atencion.findMany({
      where: {
        id_sucursal: srv.id_sucursal,
        id_estudio: srv.id_estudio,
        estado: { in: ['activo', 'llamado'] },
      },
      orderBy: { posicion: 'asc' },
      take: 10,
      include: {
        reservaciones_servicios: {
          include: {
            estudios: true,
            reservaciones: { include: { pacientes: true } },
          },
        },
      },
    });

    return cola.map((c) => {
      const r = c.reservaciones_servicios.reservaciones;
      const p = r.pacientes;
      const fullName = [p.nombre, p.apellido_paterno]
        .filter(Boolean)
        .join(' ');
      return {
        initials: this.initialsFor(fullName),
        folio: this.formatFolio(
          c.reservaciones_servicios.numero_turno ?? c.posicion,
        ),
        estudio: c.reservaciones_servicios.estudios.nombre,
        posicion: c.posicion,
        isCurrent: c.estado === 'llamado' || c.posicion === 1,
        isMine: r.id_paciente === patientId,
      };
    });
  }

  private initialsFor(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  private formatFolio(n: number): string {
    return `A${String(n).padStart(4, '0')}`;
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
