export class GeneratePassDto {
  patientId!: string;
  branchId!: number;
  studyIds!: number[];
}

export class ValidateClinicalDto {
  studyIds!: number[];
  hasMedicalOrder!: boolean;
  sampleCollectedAt?: string; // ISO 8601
}
