import { StudyType } from '../enums/index';
import type {
  RegisterVisitDto,
  StudyRequestDto,
} from '../dto/register-visit.dto';

/* ------------------------------------------------------------------ */
/*  Reglas de dependencia entre estudios                               */
/* ------------------------------------------------------------------ */

export interface DependencyRule {
  first: StudyType;
  then: StudyType;
  reason: string;
  /** Si se omite, la regla siempre aplica cuando ambos estudios están presentes */
  condition?: (visit: RegisterVisitDto) => boolean;
}

export const DEPENDENCY_RULES: DependencyRule[] = [
  {
    first: StudyType.PAPANICOLAOU,
    then: StudyType.VAGINAL_CULTURE,
    reason: 'Prioridad en la toma de muestra.',
  },
  {
    first: StudyType.PAPANICOLAOU,
    then: StudyType.VPH,
    reason: 'Prioridad en la toma de muestra.',
  },
  {
    first: StudyType.PAPANICOLAOU,
    then: StudyType.TRANSVAGINAL_ULTRASOUND,
    reason: 'Evitar interferencia en la muestra.',
  },
  {
    first: StudyType.DENSITOMETRY,
    then: StudyType.TOMOGRAPHY,
    reason: 'Solo si el estudio de imagen usa contraste.',
    condition: (visit) =>
      visit.studies.some(
        (s) => s.type === StudyType.TOMOGRAPHY && s.usesContrast,
      ),
  },
  {
    first: StudyType.DENSITOMETRY,
    then: StudyType.MRI,
    reason: 'Solo si el estudio de imagen usa contraste.',
    condition: (visit) =>
      visit.studies.some((s) => s.type === StudyType.MRI && s.usesContrast),
  },
  {
    first: StudyType.LABORATORY,
    then: StudyType.ULTRASOUND,
    reason: 'Cuando el laboratorio requiere ayuno.',
    condition: (visit) => !!visit.labRequiresFasting,
  },
];

/* ------------------------------------------------------------------ */
/*  Mapa de preparación por tipo de estudio                            */
/* ------------------------------------------------------------------ */

export const PREPARATION_MAP: Record<StudyType, boolean> = {
  [StudyType.PAPANICOLAOU]: false,
  [StudyType.VAGINAL_CULTURE]: false,
  [StudyType.VPH]: false,
  [StudyType.TRANSVAGINAL_ULTRASOUND]: false,
  [StudyType.DENSITOMETRY]: false,
  [StudyType.TOMOGRAPHY]: false,
  [StudyType.MRI]: false,
  [StudyType.LABORATORY]: true, // Puede requerir ayuno
  [StudyType.ULTRASOUND]: false,
  [StudyType.MASTOGRAPHY]: false,
};

/* ------------------------------------------------------------------ */
/*  Resolución de orden (topological sort + preparación inversa)       */
/* ------------------------------------------------------------------ */

/**
 * Ordena los estudios respetando dependencias y aplicando la lógica
 * de "preparación inversa": primero los que NO requieren preparación,
 * después los que SÍ la requieren.
 *
 * Utiliza el algoritmo de Kahn con prioridad por preparación.
 */
export function resolveStudyOrder(
  studies: StudyRequestDto[],
  visit: RegisterVisitDto,
): StudyType[] {
  const studyTypes = new Set(studies.map((s) => s.type));

  // Construir grafo dirigido solo con los estudios presentes en la visita
  const graph = new Map<StudyType, StudyType[]>();
  const inDegree = new Map<StudyType, number>();

  for (const type of studyTypes) {
    graph.set(type, []);
    inDegree.set(type, 0);
  }

  for (const rule of DEPENDENCY_RULES) {
    if (!studyTypes.has(rule.first) || !studyTypes.has(rule.then)) continue;
    if (rule.condition && !rule.condition(visit)) continue;

    graph.get(rule.first)!.push(rule.then);
    inDegree.set(rule.then, (inDegree.get(rule.then) ?? 0) + 1);
  }

  // Cola inicial: nodos sin dependencias entrantes
  const queue: StudyType[] = [];
  for (const [type, degree] of inDegree) {
    if (degree === 0) queue.push(type);
  }

  // Ordenar por preparación: sin preparación primero
  const sortByPrep = (a: StudyType, b: StudyType) => {
    const pa = PREPARATION_MAP[a] ? 1 : 0;
    const pb = PREPARATION_MAP[b] ? 1 : 0;
    return pa - pb;
  };

  queue.sort(sortByPrep);

  const result: StudyType[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    for (const neighbor of graph.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) {
        queue.push(neighbor);
        queue.sort(sortByPrep);
      }
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Consulta de dependencias de un estudio específico                  */
/* ------------------------------------------------------------------ */

export function getStudyDependencies(
  studyType: StudyType,
  studies: StudyRequestDto[],
  visit: RegisterVisitDto,
): StudyType[] {
  const studyTypes = new Set(studies.map((s) => s.type));
  const deps: StudyType[] = [];

  for (const rule of DEPENDENCY_RULES) {
    if (rule.then !== studyType) continue;
    if (!studyTypes.has(rule.first)) continue;
    if (rule.condition && !rule.condition(visit)) continue;
    deps.push(rule.first);
  }

  return deps;
}
