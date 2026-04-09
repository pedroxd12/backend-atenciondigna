export class CreatePacienteDto {
	/** UID de Firebase del paciente (opcional, para vincular sesión) */
	firebase_uid?: string;

	/** Nombre(s) del paciente */
	declare nombre: string;

	/** Apellido paterno */
	apellido_paterno?: string;

	/** Apellido materno */
	apellido_materno?: string;

	/** Fecha de nacimiento ISO 8601 (YYYY-MM-DD) */
	fecha_nacimiento?: string;

	/** Sexo: 'M' masculino, 'F' femenino */
	sexo?: 'M' | 'F';

	/** Correo electrónico */
	email?: string;

	/** Teléfono de contacto */
	telefono?: string;

	/** Latitud de ubicación habitual */
	latitud_habitual?: number;

	/** Longitud de ubicación habitual */
	longitud_habitual?: number;
}
