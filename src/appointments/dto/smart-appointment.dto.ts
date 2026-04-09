import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsArray,
  ArrayMinSize,
  IsIn,
  IsBoolean,
  IsNumber,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PacienteContext } from '../../ai/dto/predict.dto';

/**
 * DTO para crear una cita usando el motor de agenda inteligente.
 *
 * En vez de pedir hora exacta, el cliente envía la fecha (y opcionalmente
 * una ventana horaria) y el sistema usa el modelo IA para encontrar el
 * mejor slot considerando saturación, reglas de negocio y prioridad clínica.
 */
export class CreateSmartAppointmentDto {
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string; // YYYY-MM-DD

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Type(() => Number)
  studyIds!: number[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  horaApertura?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  horaCierre?: number;

  @IsOptional()
  @IsIn(['urgente', 'cita', 'sin_cita'])
  prioridad?: 'urgente' | 'cita' | 'sin_cita';

  @IsOptional()
  patientContext?: Omit<PacienteContext, 'prioridad'>;

  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}

export class RescheduleAppointmentDto {
  @IsIn(['no_show', 'tarde', 'cancelacion', 'saturacion', 'manual'])
  reason!: 'no_show' | 'tarde' | 'cancelacion' | 'saturacion' | 'manual';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minutosRetraso?: number;

  @IsOptional()
  @IsString()
  nota?: string;

  @IsOptional()
  @IsBoolean()
  permitirSiguienteDia?: boolean;
}
