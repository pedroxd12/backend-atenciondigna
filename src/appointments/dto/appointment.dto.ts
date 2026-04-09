import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsArray,
  ArrayMinSize,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAppointmentDto {
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  time?: string; // HH:mm

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Type(() => Number)
  studyIds!: number[];
}
