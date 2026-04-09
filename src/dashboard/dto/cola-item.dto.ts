/**
 * DTO para cada servicio dentro de una reservacion en cola.
 * Representa un estudio/subestudio individual que el paciente tiene asignado.
 */
export interface ServicioColaDto {
	id_estudio: number;
	estudio_nombre: string;
	id_subestudio: number | null;
	subestudio_nombre: string | null;
	estado: string;
	orden_atencion: number;
	numero_turno: number | null;
}

/**
 * DTO estandarizado para un item de la cola de pacientes.
 * Usado tanto en GET /dashboard/cola como en GET /dashboard/cola/servicio/:id
 *
 * Este contrato es consumido directamente por el frontend (dashboard-atenciondigna)
 * en la interfaz `Reservacion` de features/colas/types.
 */
export interface ColaItemDto {
	/** ID de la reservacion (BigInt convertido a string) */
	id: string;
	/** UUID del paciente */
	id_paciente: string;
	/** Nombre del paciente */
	paciente_nombre: string;
	/** Apellido paterno del paciente */
	paciente_apellido: string;
	/** Nombre completo (nombre + apellido) */
	nombre_completo: string;
	/** Fecha programada ISO (YYYY-MM-DD) */
	fecha_programada: string;
	/** Hora de la cita (HH:MM) */
	hora_cita: string;
	/** Estado de la reservacion: pendiente | en_espera | llamado | en_atencion | retrasado */
	estado: string;
	/** Canal de origen: app | recepcion | web */
	origen: string;
	/** Lista de servicios/estudios de esta reservacion */
	servicios: ServicioColaDto[];
}

/**
 * DTO para un servicio en la respuesta de reservaciones recientes.
 */
export interface ServicioRecienteDto {
	estudio: string;
	subestudio: string;
	estado: string;
	orden_atencion: number;
}

/**
 * DTO estandarizado para reservaciones recientes.
 * Usado en GET /dashboard/reservaciones/recientes
 */
export interface ReservacionRecienteDto {
	id: string;
	estado: string;
	fecha_programada: string;
	hora_programada: string;
	origen: string;
	notas: string;
	created_at: string;
	paciente: {
		nombre_completo: string;
		email: string;
		telefono: string;
	};
	sucursal: {
		nombre: string;
		direccion: string;
		telefono: string;
	};
	servicios: ServicioRecienteDto[];
}
