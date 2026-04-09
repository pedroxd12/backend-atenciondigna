import { PacienteContext } from '../../ai/dto/predict.dto';

/**
 * DTO para crear una cita usando el motor de agenda inteligente.
 *
 * En vez de pedir hora exacta, el cliente envía la fecha (y opcionalmente
 * una ventana horaria) y el sistema usa el modelo IA para encontrar el
 * mejor slot considerando saturación, reglas de negocio y prioridad clínica.
 */
export class CreateSmartAppointmentDto {
  patientId!: string;
  branchId!: number;
  date!: string; // YYYY-MM-DD
  studyIds!: number[];

  // Ventana opcional (defaults: horario de la sucursal)
  horaApertura?: number;
  horaCierre?: number;

  // Prioridad clínica del paciente (afecta scoring de slot)
  prioridad?: 'urgente' | 'cita' | 'sin_cita';

  // Contexto adicional que dispara reglas (mastografía, orina, etc.)
  patientContext?: Omit<PacienteContext, 'prioridad'>;

  /** Si false, sólo devuelve la propuesta sin crear la reservación. */
  confirm?: boolean;
}

export class RescheduleAppointmentDto {
  reason!: 'no_show' | 'tarde' | 'cancelacion' | 'saturacion' | 'manual';
  minutosRetraso?: number;
  nota?: string;
  permitirSiguienteDia?: boolean;
}
