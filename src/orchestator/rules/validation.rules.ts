import { StudyType } from '../enums/index';
import type { RegisterVisitDto } from '../dto/register-visit.dto';
import type { ValidationErrorDto } from '../dto/orchestrator-result.dto';

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const MIN_FASTING_HOURS = 8;

/* ------------------------------------------------------------------ */
/*  Validación general de la visita                                    */
/* ------------------------------------------------------------------ */

export function validateVisit(visit: RegisterVisitDto): ValidationErrorDto[] {
	const errors: ValidationErrorDto[] = [];
	const studyTypes = new Set(visit.studies.map((s) => s.type));

	if (studyTypes.has(StudyType.MASTOGRAPHY)) {
		errors.push(...validateMastography(visit));
	}

	if (studyTypes.has(StudyType.LABORATORY)) {
		errors.push(...validateLaboratory(visit));
	}

	return errors;
}

/* ------------------------------------------------------------------ */
/*  Validación de Mastografía                                          */
/* ------------------------------------------------------------------ */

function validateMastography(visit: RegisterVisitDto): ValidationErrorDto[] {
	const errors: ValidationErrorDto[] = [];

	// Edad: menores de 35 requieren orden de especialista
	if (visit.age < 35 && !visit.hasSpecialistOrder) {
		errors.push({
			studyType: StudyType.MASTOGRAPHY,
			code: 'MAST_AGE_REQUIRES_ORDER',
			message:
				'Paciente menor de 35 años requiere orden médica de un especialista para mastografía.',
			severity: 'ERROR',
		});
	}

	// Recurrencia: menos de 6 meses desde la última requiere orden nueva
	if (visit.lastMastographyDate) {
		const lastDate = new Date(visit.lastMastographyDate).getTime();
		const now = Date.now();
		if (now - lastDate < SIX_MONTHS_MS && !visit.hasSpecialistOrder) {
			errors.push({
				studyType: StudyType.MASTOGRAPHY,
				code: 'MAST_RECURRENCE_REQUIRES_ORDER',
				message:
					'Se realizó mastografía hace menos de 6 meses. Se requiere orden médica nueva.',
				severity: 'ERROR',
			});
		}
	}

	return errors;
}

/* ------------------------------------------------------------------ */
/*  Validación de Laboratorio y Muestras                               */
/* ------------------------------------------------------------------ */

function validateLaboratory(visit: RegisterVisitDto): ValidationErrorDto[] {
	const errors: ValidationErrorDto[] = [];

	// Tiempo de orina: no debe exceder 2 horas desde la recolección
	if (visit.urineSampleCollectedAt) {
		const collectedAt = new Date(visit.urineSampleCollectedAt).getTime();
		const now = Date.now();
		if (now - collectedAt > TWO_HOURS_MS) {
			errors.push({
				studyType: StudyType.LABORATORY,
				code: 'LAB_URINE_EXPIRED',
				message:
					'La muestra de orina excede las 2 horas desde su recolección. No es válida.',
				severity: 'ERROR',
			});
		}
	}

	// Ayuno: validar cumplimiento del ayuno mínimo
	if (
		visit.labRequiresFasting &&
		(!visit.fastingHours || visit.fastingHours < MIN_FASTING_HOURS)
	) {
		errors.push({
			studyType: StudyType.LABORATORY,
			code: 'LAB_FASTING_INSUFFICIENT',
			message: `El paciente no cumple con el ayuno mínimo de ${MIN_FASTING_HOURS} horas requerido para los estudios de laboratorio.`,
			severity: 'ERROR',
		});
	}

	return errors;
}
