export class CreateAppointmentDto {
  patientId!: string;
  branchId!: number;
  date!: string; // YYYY-MM-DD
  time?: string; // HH:mm
  studyIds!: number[];
}
