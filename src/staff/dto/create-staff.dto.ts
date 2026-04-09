export class CreateStaffDto {
	/** UID de Firebase (opcional) */
	firebase_uid?: string;

	/** ID de la sucursal de trabajo — requerido */
	declare id_sucursal: number;

	/** Nombre(s) del staff — requerido */
	declare nombre: string;

	/** Apellido */
	apellido?: string;

	/** Email único — requerido */
	declare email: string;

	/** Rol: recepcionista | laboratorista | ultrasonido | etc. */
	rol?: string;

	/** Contraseña para login simulado */
	password?: string;

	/** ID del estudio que atiende este usuario (FK a estudios.id) */
	id_estudio_asignado?: number;
}
