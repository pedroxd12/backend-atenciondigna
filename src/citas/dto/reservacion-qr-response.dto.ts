export interface ServicioQrDto {
	id: number;
	estudio: string;
	subestudio?: string | null;
	consultorio?: string | null;
	estado: string;
	orden_atencion: number;
}

export interface SucursalQrDto {
	nombre: string;
	direccion: string;
	telefono: string;
	hora_apertura?: string | null;
	hora_cierre?: string | null;
}

export interface PacienteQrDto {
	nombre_completo: string;
	email?: string | null;
	telefono?: string | null;
}

export interface ReservacionQrResponseDto {
	folio: string;
	estado: string;
	fecha_programada: string;
	hora_programada?: string | null;
	origen: string;
	paciente: PacienteQrDto;
	sucursal: SucursalQrDto;
	servicios: ServicioQrDto[];
	/** Código QR como Data URL base64 (image/png) */
	qr_data_url: string;
}
