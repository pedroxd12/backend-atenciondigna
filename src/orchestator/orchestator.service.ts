import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  StudyType,
  TriagePriority,
  VisitType,
  StudyStatus,
} from './enums/index';
import type { RegisterVisitDto } from './dto/register-visit.dto';
import type {
  OrchestratorResultDto,
  AssignedStudyDto,
} from './dto/orchestrator-result.dto';
import {
  resolveStudyOrder,
  getStudyDependencies,
  PREPARATION_MAP,
} from './rules/dependency.rules';
import { validateVisit } from './rules/validation.rules';

/* ------------------------------------------------------------------ */
/*  Tipos internos del orquestador                                     */
/* ------------------------------------------------------------------ */

export interface QueueEntry {
  visitId: string;
  patientId: string;
  studyType: StudyType;
  triagePriority: TriagePriority;
  status: StudyStatus;
  dependsOn: StudyType[];
  order: number;
  registeredAt: Date;
}

export interface VisitRecord {
  visitId: string;
  patientId: string;
  branchId: string;
  triagePriority: TriagePriority;
  entries: QueueEntry[];
  registeredAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Servicio Orquestador                                               */
/* ------------------------------------------------------------------ */

@Injectable()
export class OrchestatorService {
  private readonly logger = new Logger(OrchestatorService.name);

  /** Cola por tipo de estudio */
  private readonly queues = new Map<StudyType, QueueEntry[]>();

  /** Visitas registradas */
  private readonly visits = new Map<string, VisitRecord>();

  constructor() {
    for (const type of Object.values(StudyType)) {
      this.queues.set(type, []);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Registrar visita                                                 */
  /* ---------------------------------------------------------------- */

  registerVisit(dto: RegisterVisitDto): OrchestratorResultDto {
    const visitId = randomUUID();
    const registeredAt = new Date();

    // 1. Validar reglas de negocio
    const validationErrors = validateVisit(dto);
    const hasBlockingErrors = validationErrors.some(
      (e) => e.severity === 'ERROR',
    );

    // 2. Calcular prioridad de triage
    const triagePriority = this.calculateTriage(dto);

    // Si hay errores bloqueantes, devolver sin asignar colas
    if (hasBlockingErrors) {
      return {
        visitId,
        patientId: dto.patientId,
        branchId: dto.branchId,
        triagePriority,
        validationErrors,
        isBlocked: true,
        assignedStudies: [],
        registeredAt: registeredAt.toISOString(),
      };
    }

    // 3. Resolver orden de estudios (topological sort + preparación inversa)
    const orderedStudies = resolveStudyOrder(dto.studies, dto);

    // 4. Crear entradas en colas y asignar posiciones
    const entries: QueueEntry[] = [];
    const assignedStudies: AssignedStudyDto[] = [];

    for (let i = 0; i < orderedStudies.length; i++) {
      const studyType = orderedStudies[i];
      const deps = getStudyDependencies(studyType, dto.studies, dto);
      const hasDeps = deps.length > 0;

      const entry: QueueEntry = {
        visitId,
        patientId: dto.patientId,
        studyType,
        triagePriority,
        status: hasDeps ? StudyStatus.BLOCKED : StudyStatus.QUEUED,
        dependsOn: deps,
        order: i + 1,
        registeredAt,
      };

      entries.push(entry);

      // Insertar en la cola del tipo de estudio respetando prioridad
      const queue = this.queues.get(studyType)!;
      const position = this.insertByPriority(queue, entry);

      assignedStudies.push({
        studyType,
        order: i + 1,
        queuePosition: position + 1,
        status: entry.status,
        requiresPreparation: PREPARATION_MAP[studyType],
        dependsOn: deps.length > 0 ? deps : undefined,
      });
    }

    // Almacenar registro de la visita
    this.visits.set(visitId, {
      visitId,
      patientId: dto.patientId,
      branchId: dto.branchId,
      triagePriority,
      entries,
      registeredAt,
    });

    this.logger.log(
      `Visita ${visitId} registrada — paciente: ${dto.patientId}, ` +
        `estudios: ${orderedStudies.length}, prioridad: ${TriagePriority[triagePriority]}`,
    );

    return {
      visitId,
      patientId: dto.patientId,
      branchId: dto.branchId,
      triagePriority,
      validationErrors,
      isBlocked: false,
      assignedStudies,
      registeredAt: registeredAt.toISOString(),
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Completar un estudio y desbloquear dependientes                  */
  /* ---------------------------------------------------------------- */

  completeStudy(
    visitId: string,
    studyType: StudyType,
  ): { completed: StudyType; unblocked: StudyType[] } {
    const visit = this.visits.get(visitId);
    if (!visit) throw new Error(`Visita ${visitId} no encontrada.`);

    const entry = visit.entries.find((e) => e.studyType === studyType);
    if (!entry)
      throw new Error(
        `Estudio ${studyType} no encontrado en la visita ${visitId}.`,
      );

    // Marcar como completado
    entry.status = StudyStatus.COMPLETED;

    // Remover de la cola
    const queue = this.queues.get(studyType)!;
    const idx = queue.findIndex(
      (e) => e.visitId === visitId && e.studyType === studyType,
    );
    if (idx !== -1) queue.splice(idx, 1);

    // Desbloquear estudios dependientes
    const unblocked: StudyType[] = [];
    for (const dep of visit.entries) {
      if (dep.status !== StudyStatus.BLOCKED) continue;
      if (!dep.dependsOn.includes(studyType)) continue;

      // Verificar que TODAS las dependencias están completadas
      const allDepsComplete = dep.dependsOn.every((d) =>
        visit.entries.some(
          (e) => e.studyType === d && e.status === StudyStatus.COMPLETED,
        ),
      );

      if (allDepsComplete) {
        dep.status = StudyStatus.QUEUED;
        unblocked.push(dep.studyType);
        this.logger.log(
          `Estudio ${dep.studyType} desbloqueado para visita ${visitId}`,
        );
      }
    }

    return { completed: studyType, unblocked };
  }

  /* ---------------------------------------------------------------- */
  /*  Consultas                                                        */
  /* ---------------------------------------------------------------- */

  getVisit(visitId: string): VisitRecord | undefined {
    return this.visits.get(visitId);
  }

  getQueue(studyType: StudyType): QueueEntry[] {
    return this.queues.get(studyType) ?? [];
  }

  getQueueSummary(): Record<string, number> {
    const summary: Record<string, number> = {};
    for (const [type, queue] of this.queues) {
      summary[type] = queue.filter(
        (e) => e.status !== StudyStatus.COMPLETED,
      ).length;
    }
    return summary;
  }

  /* ---------------------------------------------------------------- */
  /*  Helpers privados                                                 */
  /* ---------------------------------------------------------------- */

  private calculateTriage(dto: RegisterVisitDto): TriagePriority {
    if (dto.isUrgent) return TriagePriority.URGENCY;
    if (dto.visitType === VisitType.SCHEDULED)
      return TriagePriority.APPOINTMENT;
    return TriagePriority.WALK_IN;
  }

  /**
   * Inserta una entrada en la cola respetando la prioridad de triage.
   * Dentro de la misma prioridad se mantiene orden FIFO.
   * Devuelve el índice donde se insertó.
   */
  private insertByPriority(queue: QueueEntry[], entry: QueueEntry): number {
    let insertIdx = queue.length;
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].triagePriority > entry.triagePriority) {
        insertIdx = i;
        break;
      }
    }
    queue.splice(insertIdx, 0, entry);
    return insertIdx;
  }
}
