import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { QrService } from './qr/qr.service';
import type { CreatePacienteDto } from './dto/create-paciente.dto';
import type { CreateReservacionDto } from './dto/create-reservacion.dto';
import type { ReservacionQrResponseDto } from './dto/reservacion-qr-response.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CitasService {
	private readonly logger = new Logger(CitasService.name);

	constructor(
		private readonly qrService: QrService,
		private readonly prisma: PrismaService
	) {}

	private formatTimeToHHMM(date?: Date | null) {
		if (!date) return null;
		const hh = date.getUTCHours().toString().padStart(2, '0');
		const mm = date.getUTCMinutes().toString().padStart(2, '0');
		return `${hh}:${mm}`;
	}

	async registrarPaciente(dto: CreatePacienteDto) {
		const data: any = {
			firebase_uid: dto.firebase_uid ?? undefined,
			nombre: dto.nombre,
			apellido_paterno: dto.apellido_paterno ?? undefined,
			apellido_materno: dto.apellido_materno ?? undefined,
			fecha_nacimiento: dto.fecha_nacimiento ? new Date(dto.fecha_nacimiento) : undefined,
			sexo: dto.sexo ?? undefined,
			email: dto.email ?? undefined,
			telefono: dto.telefono ?? undefined,
			latitud_habitual: dto.latitud_habitual ?? undefined,
			longitud_habitual: dto.longitud_habitual ?? undefined,
		};

		const paciente = await this.prisma.pacientes.create({ data });

		return {
			id: paciente.id,
			firebase_uid: paciente.firebase_uid ?? 'N/A',
			nombre: paciente.nombre,
			apellido_paterno: paciente.apellido_paterno ?? 'N/A',
			apellido_materno: paciente.apellido_materno ?? 'N/A',
			fecha_nacimiento: paciente.fecha_nacimiento
				? paciente.fecha_nacimiento.toISOString().split('T')[0]
				: null,
			sexo: paciente.sexo ?? 'N/A',
			email: paciente.email ?? 'N/A',
			telefono: paciente.telefono ?? 'N/A',
			latitud_habitual: paciente.latitud_habitual ?? null,
			longitud_habitual: paciente.longitud_habitual ?? null,
			created_at: paciente.created_at.toISOString(),
		};
	}

	async crearReservacion(dto: CreateReservacionDto) {
		return await this.prisma.$transaction(async (tx) => {
			const reservacion = await tx.reservaciones.create({
				data: {
					id_paciente: dto.id_paciente,
					id_sucursal: dto.id_sucursal,
					fecha_programada: new Date(dto.fecha_programada),
					hora_programada: dto.hora_programada
						? new Date(`1970-01-01T${dto.hora_programada}:00Z`)
						: undefined,
					origen: dto.origen ?? 'app',
					notas: dto.notas ?? undefined,
				},
			});

			const servicios: Array<any> = [];
			for (let i = 0; i < dto.servicios.length; i++) {
				const s = dto.servicios[i];
				const consultorio = await tx.sucursales_consultorios.findFirst({
					where: { id_sucursal: dto.id_sucursal, id_estudio: s.id_estudio, activo: true },
				});

				const srv = await tx.reservaciones_servicios.create({
					data: {
						id_reservacion: reservacion.id,
						id_estudio: s.id_estudio,
						id_subestudio: s.id_subestudio ?? undefined,
						id_sucursal: dto.id_sucursal,
						id_consultorio: consultorio?.id ?? undefined,
						orden_atencion: i + 1,
					},
				});

				servicios.push({
					id_estudio: srv.id_estudio,
					id_subestudio: srv.id_subestudio ?? null,
					id_consultorio: srv.id_consultorio ?? null,
					estado: srv.estado,
					orden_atencion: srv.orden_atencion,
				});
			}

			return {
				id: reservacion.id.toString(),
				id_paciente: reservacion.id_paciente,
				id_sucursal: reservacion.id_sucursal,
				fecha_programada: reservacion.fecha_programada.toISOString().split('T')[0],
				hora_programada: this.formatTimeToHHMM(reservacion.hora_programada) ?? 'N/A',
				origen: reservacion.origen,
				estado: reservacion.estado,
				notas: reservacion.notas ?? 'N/A',
				created_at: reservacion.created_at.toISOString(),
				servicios,
			};
		});
	}

	async getReservacionQrView(id: bigint): Promise<ReservacionQrResponseDto> {
		this.logger.log(`Generando vista QR para folio=${id}`);

		const reservacion = await this.prisma.reservaciones.findUnique({
			where: { id },
			include: {
				pacientes: true,
				sucursales: true,
				reservaciones_servicios: {
					include: { estudios: true, subestudios: true, sucursales_consultorios: true },
					orderBy: { orden_atencion: 'asc' },
				},
			},
		});

		if (!reservacion) throw new NotFoundException(`Reservación ${id} no encontrada`);

		const folio = reservacion.id.toString();
		const fecha = reservacion.fecha_programada.toISOString().split('T')[0];

		const servicios = reservacion.reservaciones_servicios.map((s) => ({
			id: Number(s.id),
			estudio: s.estudios?.nombre ?? 'N/A',
			subestudio: s.subestudios?.nombre ?? 'N/A',
			consultorio: s.sucursales_consultorios?.area_nombre ?? 'N/A',
			estado: s.estado,
			orden_atencion: s.orden_atencion,
		}));

		const nombreCompleto =
			`${reservacion.pacientes?.nombre ?? ''} ${reservacion.pacientes?.apellido_paterno ?? ''}`.trim() ||
			'Paciente';

		const qrDataUrl = await this.qrService.generateReservacionQr({
			folio,
			paciente: nombreCompleto,
			sucursal: reservacion.sucursales?.nombre ?? '',
			fecha,
			estudios: servicios.map((x) => x.estudio),
		});

		return {
			folio,
			estado: reservacion.estado,
			fecha_programada: fecha,
			hora_programada: this.formatTimeToHHMM(reservacion.hora_programada) ?? 'N/A',
			origen: reservacion.origen,
			paciente: {
				nombre_completo: nombreCompleto,
				email: reservacion.pacientes?.email ?? 'N/A',
				telefono: reservacion.pacientes?.telefono ?? 'N/A',
			},
			sucursal: {
				nombre: reservacion.sucursales?.nombre ?? 'N/A',
				direccion: reservacion.sucursales?.direccion ?? 'N/A',
				telefono: reservacion.sucursales?.telefono ?? 'N/A',
				hora_apertura:
					this.formatTimeToHHMM(reservacion.sucursales?.hora_apertura ?? null) ?? 'N/A',
				hora_cierre:
					this.formatTimeToHHMM(reservacion.sucursales?.hora_cierre ?? null) ?? 'N/A',
			},
			servicios,
			qr_data_url: qrDataUrl,
		};
	}
}
