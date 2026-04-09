import { StudyType, VisitType } from '../enums/index';

export class StudyRequestDto {
	/** Tipo de estudio solicitado */
	declare type: StudyType;

	/** Si el estudio de imagen utiliza medio de contraste */
	usesContrast?: boolean;

	/** Notas adicionales del estudio */
	notes?: string;
}

export class RegisterVisitDto {
	/** Identificador único del paciente */
	declare patientId: string;

	/** Nombre completo del paciente */
	declare patientName: string;

	/** Edad del paciente */
	declare age: number;

	/** Género del paciente */
	declare gender: 'M' | 'F';

	/** Identificador de la sucursal */
	declare branchId: string;

	/** Tipo de visita: con cita o espontánea */
	declare visitType: VisitType;

	/** ID de la cita programada (si aplica) */
	appointmentId?: string;

	/** Hora programada de la cita ISO 8601 (si aplica) */
	scheduledTime?: string;

	/** Si el paciente tiene una urgencia (sangrado, necesidad fisiológica, etc.) */
	declare isUrgent: boolean;

	/** Razón de la urgencia */
	urgencyReason?: string;

	/** Lista de estudios solicitados para esta visita */
	declare studies: StudyRequestDto[];

	/** Fecha de la última mastografía ISO 8601 (para validación de recurrencia) */
	lastMastographyDate?: string;

	/** Si el paciente cuenta con orden médica de un especialista */
	hasSpecialistOrder?: boolean;

	/** Si los estudios de laboratorio requieren ayuno */
	labRequiresFasting?: boolean;

	/** Horas de ayuno que lleva el paciente */
	fastingHours?: number;

	/** Timestamp ISO 8601 de cuándo se recolectó la muestra de orina */
	urineSampleCollectedAt?: string;
}
