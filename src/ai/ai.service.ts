import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  PredictDto,
  BatchPredictDto,
  PredictionResponse,
  BatchPredictionResponse,
  SaturacionResponse,
  ModelInfoResponse,
  OptimalSlotDto,
  OptimalSlotResponse,
  RescheduleDto,
  RescheduleResponse,
  DynamicReorderDto,
  DynamicReorderResponse,
  InitClinicDto,
  RegisterPatientDto,
  PatientLifecycleDto,
  GlobalPlanResponse,
  ClinicSnapshotResponse,
} from './dto/predict.dto';

/**
 * Cliente del microservicio IA (FastAPI / Railway).
 *
 * Usa `fetch` global (Node 18+) — sin dependencias extra. Si en el futuro
 * se requieren reintentos avanzados o circuit-breaker, migrar a
 * `@nestjs/axios` + `axios-retry`.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor() {
    // Normaliza AI_SERVICE_URL: si la variable de entorno viene sin
    // esquema (ej: "orquestador-atenciondigna-production.up.railway.app"),
    // anteponemos https:// para que `fetch` no truene con
    // "Failed to parse URL". Tambien quita la barra final.
    const raw = (process.env.AI_SERVICE_URL ?? 'http://localhost:8000').trim();
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    this.baseUrl = withScheme.replace(/\/$/, '');
    // 20s default — Railway puede tardar varios segundos en cold start.
    this.timeoutMs = Number(process.env.AI_SERVICE_TIMEOUT_MS ?? 20000);
    this.logger.log(`AI service base URL: ${this.baseUrl}`);
  }

  // ──────────────────────────────────────────────
  // HTTP helper con timeout y manejo de errores
  // ──────────────────────────────────────────────
  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        // No spammeamos como WARN cuando el servicio IA esta caido (404 de
        // Railway). Los consumidores ya tienen fallback historico.
        this.logger.debug(`AI ${res.status} ${path} — ${body}`);
        throw new HttpException(
          `Error del servicio IA (${res.status}): ${body || res.statusText}`,
          res.status as HttpStatus,
        );
      }

      return (await res.json()) as T;
    } catch (err: unknown) {
      if (err instanceof HttpException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Fallo conectando con el servicio IA en ${url}: ${msg}`);
      throw new ServiceUnavailableException(
        'Servicio IA no disponible. Intenta de nuevo en unos segundos.',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  // ──────────────────────────────────────────────
  // Endpoints de alto nivel
  // ──────────────────────────────────────────────
  health() {
    return this.request<{ status: string; modelo_cargado: boolean }>('/health');
  }

  modelInfo(): Promise<ModelInfoResponse> {
    return this.request<ModelInfoResponse>('/model/info');
  }

  predict(dto: PredictDto): Promise<PredictionResponse> {
    return this.request<PredictionResponse>('/predict', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  predictBatch(dto: BatchPredictDto): Promise<BatchPredictionResponse> {
    return this.request<BatchPredictionResponse>('/predict/batch', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  // ──────────────────────────────────────────────
  // Agenda inteligente
  // ──────────────────────────────────────────────
  optimalSlot(dto: OptimalSlotDto): Promise<OptimalSlotResponse> {
    return this.request<OptimalSlotResponse>('/agenda/optimal-slot', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  reschedule(dto: RescheduleDto): Promise<RescheduleResponse> {
    return this.request<RescheduleResponse>('/agenda/reschedule', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  dynamicReorder(dto: DynamicReorderDto): Promise<DynamicReorderResponse> {
    return this.request<DynamicReorderResponse>('/agenda/dynamic-reorder', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  // ──────────────────────────────────────────────
  // Scheduler global de sucursal (in-memory clinic state)
  // ──────────────────────────────────────────────
  initClinic(dto: InitClinicDto): Promise<ClinicSnapshotResponse> {
    return this.request<ClinicSnapshotResponse>('/scheduler/clinic/init', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  advanceClock(idSucursal: number, nowMin: number): Promise<ClinicSnapshotResponse> {
    const qs = new URLSearchParams({
      id_sucursal: String(idSucursal),
      now_min: String(nowMin),
    });
    return this.request<ClinicSnapshotResponse>(
      `/scheduler/clinic/advance?${qs.toString()}`,
      { method: 'POST' },
    );
  }

  registerPatient(dto: RegisterPatientDto): Promise<GlobalPlanResponse> {
    return this.request<GlobalPlanResponse>('/scheduler/patient/register', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  startAttention(dto: PatientLifecycleDto): Promise<GlobalPlanResponse> {
    return this.request<GlobalPlanResponse>('/scheduler/patient/start', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  finishAttention(dto: PatientLifecycleDto): Promise<GlobalPlanResponse> {
    return this.request<GlobalPlanResponse>('/scheduler/patient/finish', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  replanClinic(idSucursal: number): Promise<GlobalPlanResponse> {
    const qs = new URLSearchParams({ id_sucursal: String(idSucursal) });
    return this.request<GlobalPlanResponse>(
      `/scheduler/replan?${qs.toString()}`,
      { method: 'POST' },
    );
  }

  /**
   * Snapshot vivo del modelo IA para una sucursal.
   *
   * Estrategia:
   *   1. Intenta `/scheduler/clinic/:id/snapshot` (scheduler global con
   *      estado en memoria — version reciente del microservicio).
   *   2. Si no existe (deploy viejo), cae a `/sucursal/:id/saturacion`,
   *      que predice tiempos por estudio con XGBoost. Mapea la respuesta
   *      al mismo formato `ClinicSnapshotResponse` esperado por el resto
   *      del backend.
   *
   * Resultado: el catalogo siempre muestra tiempos vivos del modelo IA
   * mientras al menos uno de los dos endpoints este disponible.
   */
  async clinicSnapshot(idSucursal: number): Promise<ClinicSnapshotResponse> {
    try {
      return await this.request<ClinicSnapshotResponse>(
        `/scheduler/clinic/${idSucursal}/snapshot`,
      );
    } catch (_) {
      // Fallback: usamos /sucursal/:id/saturacion (que si existe en el deploy actual)
      const ahora = new Date();
      const hora = ahora.getHours();
      // 0 = Lunes ... 6 = Domingo (mismo encoding que el modelo Python)
      const diaSemana = (ahora.getDay() + 6) % 7;
      const sat = await this.saturacion(idSucursal, hora, diaSemana);
      return {
        id_sucursal: sat.id_sucursal,
        now_min: 0,
        salas: sat.estudios.map((s) => ({
          id_estudio: s.id_estudio,
          nombre_estudio: s.nombre_estudio,
          capacidad: 1,
          ocupados: 0,
          libres: 1,
          cola_pacientes: 0,
          tiempo_servicio_min: 0,
          tiempo_espera_estimado_min: s.tiempo_espera_pred_min,
          nivel_saturacion: s.nivel_saturacion,
        })),
        pacientes_activos: 0,
        espera_promedio_actual_min:
          sat.estudios.reduce(
            (acc, s) => acc + s.tiempo_espera_pred_min,
            0,
          ) / Math.max(sat.estudios.length, 1),
      };
    }
  }

  clinicPlan(idSucursal: number): Promise<GlobalPlanResponse> {
    return this.request<GlobalPlanResponse>(
      `/scheduler/clinic/${idSucursal}/plan`,
    );
  }

  saturacion(
    idSucursal: number,
    hora = 7,
    diaSemana = 3,
  ): Promise<SaturacionResponse> {
    const qs = new URLSearchParams({
      hora: String(hora),
      dia_semana: String(diaSemana),
    });
    return this.request<SaturacionResponse>(
      `/sucursal/${idSucursal}/saturacion?${qs.toString()}`,
    );
  }
}
