import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateStaffDto } from './dto/create-staff.dto';
import type { LoginStaffDto } from './dto/login-staff.dto';

@Injectable()
export class StaffService {
	constructor(private readonly prisma: PrismaService) {}

	async crearStaff(dto: CreateStaffDto) {
		const staff = await (this.prisma.usuarios_staff.create({
			data: {
				firebase_uid: dto.firebase_uid ?? undefined,
				id_sucursal: dto.id_sucursal,
				nombre: dto.nombre,
				apellido: dto.apellido ?? undefined,
				email: dto.email,
				rol: dto.rol ?? 'recepcionista',
				//Es solo un login simulado, en produccion real se encriptaria la pass con algun algoritmo
				...(dto.password ? { password: dto.password } : {}),
				...(dto.id_estudio_asignado
					? { id_estudio_asignado: dto.id_estudio_asignado }
					: {}),
			} as any,
			include: {
				sucursales: { select: { id: true, nombre: true } },
			},
		}) as any);

		let estudioInfo: any = null;
		if (staff.id_estudio_asignado) {
			estudioInfo = await this.prisma.estudios.findUnique({
				where: { id: staff.id_estudio_asignado },
				select: { id: true, nombre: true },
			});
		}

		return {
			id: staff.id,
			nombre: staff.nombre,
			apellido: staff.apellido ?? 'N/A',
			email: staff.email,
			rol: staff.rol,
			id_estudio_asignado: staff.id_estudio_asignado ?? null,
			estudio: estudioInfo
				? { id: estudioInfo.id, nombre: estudioInfo.nombre }
				: { id: null, nombre: 'N/A' },
			sucursal: {
				id: staff.sucursales.id,
				nombre: staff.sucursales.nombre,
			},
			created_at: staff.created_at.toISOString(),
		};
	}

	async login(dto: LoginStaffDto) {
		// Login simulado: comparación directa de contraseña (sin hash).
		// En producción usar bcrypt.compare().
		const staff = await (this.prisma.usuarios_staff.findFirst({
			where: {
				email: dto.email,
				// password comparado como campo extendido; disponible tras prisma generate
				...({ password: dto.password } as any),
				activo: true,
			} as any,
			include: {
				sucursales: { select: { id: true, nombre: true } },
			},
		}) as any);

		if (!staff) throw new UnauthorizedException('Credenciales inválidas');

		let estudioInfo: any = null;
		if (staff.id_estudio_asignado) {
			estudioInfo = await this.prisma.estudios.findUnique({
				where: { id: staff.id_estudio_asignado },
				select: { id: true, nombre: true },
			});
		}

		return {
			id: staff.id,
			nombre: staff.nombre,
			apellido: staff.apellido ?? 'N/A',
			email: staff.email,
			rol: staff.rol,
			id_estudio_asignado: staff.id_estudio_asignado ?? null,
			estudio: estudioInfo
				? { id: estudioInfo.id, nombre: estudioInfo.nombre }
				: { id: null, nombre: 'N/A' },
			sucursal: {
				id: staff.sucursales.id,
				nombre: staff.sucursales.nombre,
			},
		};
	}
}
