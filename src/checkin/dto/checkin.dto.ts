export class GeneratePassDto {
  patientId!: string;
  branchId!: number;
  studyIds!: number[];
  prioridad?: 'urgente' | 'cita' | 'sin_cita';
}

export class ValidateClinicalDto {
  studyIds!: number[];
  hasMedicalOrder!: boolean;
  sampleCollectedAt?: string; // ISO 8601
  patientId?: string;
}
