import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
	ColaItemDto,
	ServicioColaDto,
	ReservacionRecienteDto,
} from './dto/cola-item.dto';

@Injectable()
export class DashboardService {
	constructor(private readonly prisma: PrismaService) {}

	private formatTimeToHHMM(date?: Date | null): string {
		if (!date) return 'N/A';
		const hh = date.getUTCHours().toString().padStart(2, '0');
		const mm = date.getUTCMinutes().toString().padStart(2, '0');
		return `${hh}:${mm}`;
	}

	async getReservacionesRecientes(idSucursal?: number): Promise<ReservacionRecienteDto[]> {
		const reservaciones = await this.prisma.reservaciones.findMany({
			take: 5,
			orderBy: { created_at: 'desc' },
			...(idSucursal ? { where: { id_sucursal: idSucursal } } : {}),
			include: {
				pacientes: {
					select: {
						nombre: true,
						apellido_paterno: true,
						email: true,
						telefono: true,
					},
				},
				sucursales: {
					select: {
						nombre: true,
						direccion: true,
						telefono: true,
					},
				},
				reservaciones_servicios: {
					include: {
						estudios: { select: { nombre: true } },
						subestudios: { select: { nombre: true } },
					},
					orderBy: { orden_atencion: 'asc' },
				},
			},
		});

		return reservaciones.map((r) => ({
			id: r.id.toString(),
			estado: r.estado,
			fecha_programada: r.fecha_programada.toISOString().split('T')[0],
			hora_programada: this.formatTimeToHHMM(r.hora_programada),
			origen: r.origen,
			notas: r.notas ?? 'N/A',
			created_at: r.created_at.toISOString(),
			paciente: {
				nombre_completo:
					`${r.pacientes?.nombre ?? ''} ${r.pacientes?.apellido_paterno ?? ''}`.trim() ||
					'N/A',
				email: r.pacientes?.email ?? 'N/A',
				telefono: r.pacientes?.telefono ?? 'N/A',
			},
			sucursal: {
				nombre: r.sucursales?.nombre ?? 'N/A',
				direccion: r.sucursales?.direccion ?? 'N/A',
				telefono: r.sucursales?.telefono ?? 'N/A',
			},
			servicios: r.reservaciones_servicios.map((s) => ({
				estudio: s.estudios?.nombre ?? 'N/A',
				subestudio: s.subestudios?.nombre ?? 'N/A',
				estado: s.estado,
				orden_atencion: s.orden_atencion,
			})),
		}));
	}

	// ─── Helpers privados ────────────────────────────────────────────────────────

	private hoySinHora() {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		return d;
	}

	private mayanaSinHora() {
		const d = new Date();
		d.setDate(d.getDate() + 1);
		d.setHours(0, 0, 0, 0);
		return d;
	}

	private calcularEstado(estado: string, horaProgramada: Date | null): string {
		if (!horaProgramada || estado !== 'pendiente') return estado;
		const ahoraMin = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
		const citaMin = horaProgramada.getUTCHours() * 60 + horaProgramada.getUTCMinutes();
		return citaMin < ahoraMin ? 'retrasado' : estado;
	}

	/**
	 * Mapea una reservacion con sus relaciones a un ColaItemDto estandarizado.
	 * Incluye TODOS los servicios de la reservacion para que el frontend
	 * pueda agrupar por area/estudio.
	 */
	private mapColaItem(r: any): ColaItemDto {
		const pacienteNombre = r.pacientes?.nombre ?? 'N/A';
		const pacienteApellido = r.pacientes?.apellido_paterno ?? '';

		const servicios: ServicioColaDto[] = (r.reservaciones_servicios ?? []).map((s: any) => ({
			id_estudio: s.id_estudio,
			estudio_nombre: s.estudios?.nombre ?? 'N/A',
			id_subestudio: s.id_subestudio ?? null,
			subestudio_nombre: s.subestudios?.nombre ?? null,
			estado: s.estado,
			orden_atencion: s.orden_atencion,
			numero_turno: s.numero_turno ?? null,
		}));

		return {
			id: r.id.toString(),
			id_paciente: r.id_paciente,
			paciente_nombre: pacienteNombre,
			paciente_apellido: pacienteApellido,
			nombre_completo: `${pacienteNombre} ${pacienteApellido}`.trim() || 'N/A',
			hora_cita: this.formatTimeToHHMM(r.hora_programada),
			fecha_programada: r.fecha_programada.toISOString().split('T')[0],
			estado: this.calcularEstado(r.estado, r.hora_programada),
			origen: r.origen,
			servicios,
		};
	}

	/** Todos los pacientes con cita hoy (todos los estados) */
	async getColaPacientes(idSucursal?: number): Promise<ColaItemDto[]> {
		const reservaciones = await this.prisma.reservaciones.findMany({
			where: {
				fecha_programada: { gte: this.hoySinHora(), lt: this.mayanaSinHora() },
				...(idSucursal ? { id_sucursal: idSucursal } : {}),
			},
			orderBy: [{ hora_programada: { sort: 'asc', nulls: 'last' } }],
			include: {
				pacientes: {
					select: { id: true, nombre: true, apellido_paterno: true },
				},
				reservaciones_servicios: {
					orderBy: { orden_atencion: 'asc' },
					include: {
						estudios: { select: { nombre: true } },
						subestudios: { select: { nombre: true } },
					},
				},
			},
		});

		return reservaciones.map((r) => this.mapColaItem(r));
	}

	/** Solo pacientes cuya cita incluye el estudio indicado (todos los estados) */
	async getColaPorServicio(id_estudio: number, idSucursal?: number): Promise<ColaItemDto[]> {
		const reservaciones = await this.prisma.reservaciones.findMany({
			where: {
				fecha_programada: { gte: this.hoySinHora(), lt: this.mayanaSinHora() },
				reservaciones_servicios: { some: { id_estudio } },
				...(idSucursal ? { id_sucursal: idSucursal } : {}),
			},
			orderBy: [{ hora_programada: { sort: 'asc', nulls: 'last' } }],
			include: {
				pacientes: {
					select: { id: true, nombre: true, apellido_paterno: true },
				},
				reservaciones_servicios: {
					orderBy: { orden_atencion: 'asc' },
					include: {
						estudios: { select: { nombre: true } },
						subestudios: { select: { nombre: true } },
					},
				},
			},
		});

		return reservaciones.map((r) => this.mapColaItem(r));
	}
}
