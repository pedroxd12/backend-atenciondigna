import { StudyType, TriagePriority, StudyStatus } from '../enums/index';

export class ValidationErrorDto {
	declare studyType: StudyType;
	declare code: string;
	declare message: string;
	declare severity: 'ERROR' | 'WARNING';
}

export class AssignedStudyDto {
	declare studyType: StudyType;
	declare order: number;
	declare queuePosition: number;
	declare status: StudyStatus;
	declare requiresPreparation: boolean;
	dependsOn?: StudyType[];
}

export class OrchestratorResultDto {
	declare visitId: string;
	declare patientId: string;
	declare branchId: string;
	declare triagePriority: TriagePriority;
	declare validationErrors: ValidationErrorDto[];
	declare isBlocked: boolean;
	declare assignedStudies: AssignedStudyDto[];
	declare registeredAt: string;
}
