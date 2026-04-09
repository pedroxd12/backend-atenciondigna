import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

/**
 * WebSocket Gateway para tiempo real.
 *
 * Canales:
 *   - "colas"        → estado de colas por sucursal (dashboard)
 *   - "tracking"     → tracking individual de paciente (app movil)
 *   - "clinic"       → snapshot de la clinica (dashboard recepcion)
 *
 * El dashboard se suscribe enviando: { event: "subscribe", data: { channel: "colas", branchId: 46 } }
 * La app movil se suscribe enviando: { event: "subscribe", data: { channel: "tracking", patientId: "uuid" } }
 */
@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/ws',
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private intervals = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
    const interval = this.intervals.get(client.id);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(client.id);
    }
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channel: string; branchId?: number; patientId?: string },
  ) {
    const { channel, branchId, patientId } = data;
    this.logger.log(`Suscripcion: ${channel} client=${client.id}`);

    // Limpiamos intervalo previo si existe
    const prev = this.intervals.get(client.id);
    if (prev) clearInterval(prev);

    if (channel === 'colas' && branchId) {
      client.join(`colas:${branchId}`);
      // Envio inmediato + polling cada 3s
      const send = async () => {
        const snapshot = await this.getQueueSnapshot(branchId);
        client.emit('snapshot', snapshot);
      };
      await send();
      this.intervals.set(client.id, setInterval(send, 3000));
    }

    if (channel === 'tracking' && patientId) {
      client.join(`tracking:${patientId}`);
      const send = async () => {
        const status = await this.getTrackingSnapshot(patientId);
        client.emit('tracking_update', status);
      };
      await send();
      this.intervals.set(client.id, setInterval(send, 5000));
    }

    if (channel === 'clinic' && branchId) {
      client.join(`clinic:${branchId}`);
      const send = async () => {
        const snapshot = await this.getClinicSnapshot(branchId);
        client.emit('clinic_snapshot', snapshot);
      };
      await send();
      this.intervals.set(client.id, setInterval(send, 5000));
    }

    return { subscribed: channel };
  }

  /**
   * Metodo publico para que otros servicios emitan actualizaciones
   * cuando ocurre un evento (checkin, llamado, fin de atencion).
   */
  async broadcastQueueUpdate(branchId: number) {
    const snapshot = await this.getQueueSnapshot(branchId);
    this.server.to(`colas:${branchId}`).emit('snapshot', snapshot);
    // Tambien actualizamos el clinic snapshot
    const clinic = await this.getClinicSnapshot(branchId);
    this.server.to(`clinic:${branchId}`).emit('clinic_snapshot', clinic);
  }

  async broadcastTrackingUpdate(patientId: string) {
    const status = await this.getTrackingSnapshot(patientId);
    this.server.to(`tracking:${patientId}`).emit('tracking_update', status);
  }

  // ──────────────────────────────────────────────
  // Data fetchers
  // ──────────────────────────────────────────────

  private async getQueueSnapshot(branchId: number) {
    // Obtener colas activas agrupadas por estudio
    const colas = await this.prisma.cola_atencion.findMany({
      where: { id_sucursal: branchId, estado: 'activo' },
      include: {
        estudios: true,
        reservaciones_servicios: {
          include: {
            reservaciones: { include: { pacientes: true } },
          },
        },
      },
      orderBy: { posicion: 'asc' },
    });

    // Consultorios por estudio
    const consultorios = await this.prisma.sucursales_consultorios.findMany({
      where: { id_sucursal: branchId, activo: true },
      include: { estudios: true },
    });

    // Agrupar por estudio
    const areasMap = new Map<number, {
      id: number;
      name: string;
      capacity: number;
      patients: Array<{
        id: string;
        ticket: string;
        name: string;
        waitMinutes: number;
        status: string;
        position: number;
      }>;
    }>();

    for (const c of consultorios) {
      if (!areasMap.has(c.id_estudio)) {
        areasMap.set(c.id_estudio, {
          id: c.id_estudio,
          name: c.estudios.nombre,
          capacity: c.cantidad,
          patients: [],
        });
      }
    }

    for (const item of colas) {
      let area = areasMap.get(item.id_estudio);
      if (!area) {
        area = {
          id: item.id_estudio,
          name: item.estudios.nombre,
          capacity: 1,
          patients: [],
        };
        areasMap.set(item.id_estudio, area);
      }

      const rs = item.reservaciones_servicios;
      const paciente = rs?.reservaciones?.pacientes;
      const waitMs = item.created_at
        ? Date.now() - new Date(item.created_at).getTime()
        : 0;

      area.patients.push({
        id: rs?.id?.toString() ?? '',
        ticket: `T-${item.posicion}`,
        name: paciente
          ? `${paciente.nombre} ${paciente.apellido_paterno ?? ''}`.trim()
          : 'Paciente',
        waitMinutes: Math.round(waitMs / 60000),
        status: item.estado,
        position: item.posicion,
      });
    }

    // Pacientes en atencion activa
    const enAtencion = await this.prisma.reservaciones_servicios.count({
      where: {
        id_sucursal: branchId,
        estado: 'en_atencion',
      },
    });

    const areas = Array.from(areasMap.values()).map((a) => ({
      ...a,
      inQueue: a.patients.length,
      occupied: Math.min(enAtencion, a.capacity),
      saturation: a.capacity > 0
        ? Math.round((a.patients.length / a.capacity) * 100)
        : 0,
    }));

    return {
      branchId,
      timestamp: new Date().toISOString(),
      totalWaiting: colas.length,
      totalInAttention: enAtencion,
      areas,
    };
  }

  private async getTrackingSnapshot(patientId: string) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const reservacion = await this.prisma.reservaciones.findFirst({
      where: {
        id_paciente: patientId,
        fecha_programada: { gte: hoy },
        estado: { in: ['pendiente', 'en_proceso'] },
      },
      include: {
        sucursales: true,
        reservaciones_servicios: {
          include: { estudios: true },
          orderBy: { orden_atencion: 'asc' },
        },
      },
      orderBy: { fecha_programada: 'desc' },
    });

    if (!reservacion) {
      return { hasActiveVisit: false, patientId };
    }

    const studies = reservacion.reservaciones_servicios.map((rs) => ({
      id: rs.id_estudio,
      name: rs.estudios.nombre,
      status: rs.estado,
      order: rs.orden_atencion,
      estimatedMinutes: rs.tiempo_espera_predicho_min ?? rs.estudios.tiempo_espera_promedio_min ?? 15,
    }));

    const completed = studies.filter((s) => s.status === 'completado').length;
    const current = studies.find(
      (s) => s.status === 'en_espera' || s.status === 'llamado' || s.status === 'en_atencion',
    );

    return {
      hasActiveVisit: true,
      patientId,
      branchName: reservacion.sucursales.nombre,
      totalStudies: studies.length,
      completedStudies: completed,
      progressPercent: studies.length > 0 ? Math.round((completed / studies.length) * 100) : 0,
      currentStudy: current ?? null,
      studies,
    };
  }

  private async getClinicSnapshot(branchId: number) {
    try {
      return await this.ai.clinicSnapshot(branchId);
    } catch {
      // Fallback: datos directos de DB
      const enCola = await this.prisma.cola_atencion.count({
        where: { id_sucursal: branchId, estado: 'activo' },
      });
      const enAtencion = await this.prisma.reservaciones_servicios.count({
        where: { id_sucursal: branchId, estado: 'en_atencion' },
      });
      return {
        id_sucursal: branchId,
        pacientes_activos: enAtencion,
        en_cola: enCola,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
