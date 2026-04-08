import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea una reservacion + sus `reservaciones_servicios` asociados.
   * Es la accion principal del flujo "solicitar un servicio" en la app.
   */
  async create(dto: CreateAppointmentDto) {
    const paciente = await this.prisma.pacientes.findUnique({
      where: { id: dto.patientId },
    });
    if (!paciente) throw new NotFoundException('Paciente no encontrado');

    const sucursal = await this.prisma.sucursales.findUnique({
      where: { id: dto.branchId },
    });
    if (!sucursal) throw new NotFoundException('Sucursal no encontrada');

    const fecha = new Date(dto.date);
    fecha.setHours(0, 0, 0, 0);
    const horaProgramada = dto.time
      ? new Date(`1970-01-01T${dto.time}:00Z`)
      : null;

    const reservacion = await this.prisma.reservaciones.create({
      data: {
        id_paciente: dto.patientId,
        id_sucursal: dto.branchId,
        fecha_programada: fecha,
        hora_programada: horaProgramada,
        origen: 'app',
        estado: 'pendiente',
        reservaciones_servicios: {
          create: dto.studyIds.map((id, i) => ({
            id_estudio: id,
            id_sucursal: dto.branchId,
            estado: 'en_espera',
            orden_atencion: i,
          })),
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
      studyIds: reservacion.reservaciones_servicios.map((s) => s.id_estudio),
      status: reservacion.estado,
    };
  }

  async listForPatient(patientId: string) {
    const rows = await this.prisma.reservaciones.findMany({
      where: { id_paciente: patientId },
      include: {
        sucursales: true,
        reservaciones_servicios: { include: { estudios: true } },
      },
      orderBy: { fecha_programada: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id.toString(),
      branchId: r.id_sucursal,
      branchName: r.sucursales.nombre,
      date: r.fecha_programada.toISOString().substring(0, 10),
      time: r.hora_programada?.toISOString().substring(11, 16),
      status: r.estado,
      studies: r.reservaciones_servicios.map((s) => ({
        id: s.id_estudio,
        name: s.estudios.nombre,
      })),
    }));
  }
}
