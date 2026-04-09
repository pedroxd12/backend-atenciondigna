import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsArray,
  ArrayMinSize,
  IsIn,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GeneratePassDto {
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Type(() => Number)
  studyIds!: number[];

  @IsOptional()
  @IsIn(['urgente', 'cita', 'sin_cita'])
  prioridad?: 'urgente' | 'cita' | 'sin_cita';
}

export class ValidateClinicalDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Type(() => Number)
  studyIds!: number[];

  @IsBoolean()
  hasMedicalOrder!: boolean;

  @IsOptional()
  @IsString()
  sampleCollectedAt?: string; // ISO 8601

  @IsOptional()
  @IsString()
  patientId?: string;
}
