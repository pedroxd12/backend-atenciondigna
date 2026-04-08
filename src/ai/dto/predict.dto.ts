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
