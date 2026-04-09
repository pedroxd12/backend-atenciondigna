/**
 * DTOs del módulo IA — espejo de los Pydantic schemas del microservicio FastAPI.
 * Cualquier cambio aquí debe reflejarse en `modelo-ia/app/schemas.py`.
 */

export class PredictDto {
  id_sucursal!: number;
  id_estudio!: number;
  hora!: number;        // 0-23
  dia_semana!: number;  // 0=Lun ... 6=Dom
  pacientes_en_cola?: number;
  consultorios_activos?: number;
}

export class BatchPredictDto {
  id_sucursal!: number;
  hora!: number;
  dia_semana!: number;
  estudios!: number[];
}

export interface PredictionResponse {
  id_sucursal: number;
  id_estudio: number;
  nombre_estudio: string;
  hora: number;
  dia_semana: number;
  tiempo_espera_pred_min: number;
  nivel_saturacion: 'bajo' | 'medio' | 'alto' | 'critico';
  score_confianza: number;
  modelo: string;
  mensaje: string;
}

export interface EstudioOrdenado {
  id_estudio: number;
  nombre_estudio: string;
  tiempo_espera_pred_min: number;
  requiere_preparacion: boolean;
  nivel_saturacion: 'bajo' | 'medio' | 'alto' | 'critico';
}

export interface BatchPredictionResponse {
  id_sucursal: number;
  predicciones: EstudioOrdenado[];
  orden_recomendado: number[];
  tiempo_total_estimado_min: number;
}

export interface SaturacionResponse {
  id_sucursal: number;
  hora: number;
  dia_semana: number;
  estudios: Array<{
    id_estudio: number;
    nombre_estudio: string;
    tiempo_espera_pred_min: number;
    nivel_saturacion: 'bajo' | 'medio' | 'alto' | 'critico';
  }>;
}

export interface ModelInfoResponse {
  version: string;
  mae_min: number;
  rmse_min: number;
  r2: number;
  cv_mae_mean: number;
  cv_mae_std: number;
  n_train: number;
  features: string[];
}

// ──────────────────────────────────────────────
// Agenda inteligente
// ──────────────────────────────────────────────
export interface PacienteContext {
  edad?: number;
  dias_desde_ultima_mastografia?: number;
  hora_recoleccion_orina?: string;
  hora_actual?: string;
  llego_a_tiempo?: boolean;
  prioridad?: 'urgente' | 'cita' | 'sin_cita';
}

export interface OptimalSlotDto {
  id_sucursal: number;
  fecha: string; // YYYY-MM-DD
  estudios: number[];
  paciente?: PacienteContext;
  hora_apertura?: number;
  hora_cierre?: number;
  duracion_estimada_min?: number;
  top_n?: number;
}

export interface SlotCandidato {
  fecha: string;
  hora: number;
  dia_semana: number;
  tiempo_total_estimado_min: number;
  nivel_saturacion_promedio: 'bajo' | 'medio' | 'alto' | 'critico';
  score: number;
  razon: string;
  orden_recomendado: number[];
}

export interface ValidacionRegla {
  regla: string;
  severidad: 'info' | 'warning' | 'error';
  mensaje: string;
  accion_sugerida?: string;
}

export interface OptimalSlotResponse {
  id_sucursal: number;
  fecha: string;
  slots: SlotCandidato[];
  mejor_slot: SlotCandidato;
  validaciones: ValidacionRegla[];
}

export interface RescheduleMotivo {
  tipo: 'no_show' | 'tarde' | 'cancelacion' | 'saturacion' | 'manual';
  minutos_retraso?: number;
  nota?: string;
}

export interface RescheduleDto {
  id_sucursal: number;
  fecha_actual: string;
  hora_actual: number;
  estudios: number[];
  motivo: RescheduleMotivo;
  paciente?: PacienteContext;
  permitir_siguiente_dia?: boolean;
  hora_apertura?: number;
  hora_cierre?: number;
}

export interface RescheduleResponse {
  nuevo_slot: SlotCandidato;
  requirio_dia_siguiente: boolean;
  motivo_aplicado: string;
  estudios_afectados: number[];
  validaciones: ValidacionRegla[];
}

export interface ServicioPendienteDto {
  id_estudio: number;
  estado: 'en_espera' | 'llamado' | 'en_proceso' | 'completado';
  pacientes_en_cola?: number;
  consultorios_activos?: number;
}

export interface DynamicReorderDto {
  id_sucursal: number;
  hora: number;
  dia_semana: number;
  servicios: ServicioPendienteDto[];
  paciente?: PacienteContext;
}

export interface DynamicReorderResponse {
  id_sucursal: number;
  nuevo_orden: number[];
  cambios: boolean;
  razon: string;
  predicciones: EstudioOrdenado[];
  tiempo_total_restante_min: number;
  validaciones: ValidacionRegla[];
}

// ──────────────────────────────────────────────
// Scheduler global de sucursal (in-memory clinic state)
// ──────────────────────────────────────────────
export interface InitClinicDto {
  id_sucursal: number;
  consultorios?: Record<number, number>;
  now_min?: number;
}

export interface RegisterPatientDto {
  id_sucursal: number;
  id_paciente: string;
  estudios: number[];
  prioridad?: 'urgente' | 'cita' | 'sin_cita';
  hora_llegada_min?: number;
}

export interface PatientLifecycleDto {
  id_sucursal: number;
  id_paciente: string;
  id_estudio: number;
  now_min?: number;
}

export interface AsignacionPlan {
  id_paciente: string;
  id_estudio: number;
  nombre_estudio: string;
  inicio_min: number;
  fin_min: number;
}

export interface PlanPaciente {
  id_paciente: string;
  prioridad: string;
  orden_estudios: number[];
  eta_inicio_min: number;
  eta_fin_min: number;
  espera_total_min: number;
  desglose: AsignacionPlan[];
}

export interface SwapAplicado {
  id_paciente: string;
  id_estudio_adelantado: number;
  ahorro_min: number;
  espera_promedio_antes: number;
  espera_promedio_despues: number;
}

export interface GlobalPlanResponse {
  id_sucursal: number;
  now_min: number;
  motivo: string;
  espera_promedio_total_min: number;
  espera_max_min: number;
  pacientes: PlanPaciente[];
  swaps_aplicados: SwapAplicado[];
}

export interface SaturacionSala {
  id_estudio: number;
  nombre_estudio: string;
  capacidad: number;
  ocupados: number;
  libres: number;
  cola_pacientes: number;
  tiempo_servicio_min: number;
  tiempo_espera_estimado_min: number;
  nivel_saturacion: 'bajo' | 'medio' | 'alto' | 'critico';
}

export interface ClinicSnapshotResponse {
  id_sucursal: number;
  now_min: number;
  salas: SaturacionSala[];
  pacientes_activos: number;
  espera_promedio_actual_min: number;
}
