import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SurveyAnswer {
  questionId: string;
  rating: number;
}

/**
 * Mapea las 4 preguntas del cuestionario movil a las columnas de `encuestas`:
 *   q1 -> calificacion_espera
 *   q2 -> calificacion_app   (claridad del orden de estudios)
 *   q3 -> calificacion_trato
 *   q4 -> calificacion_general (recomendaria)
 */
const QUESTION_MAP: Record<string, keyof EncuestaCols> = {
  q1: 'calificacion_espera',
  q2: 'calificacion_app',
  q3: 'calificacion_trato',
  q4: 'calificacion_general',
};

interface EncuestaCols {
  calificacion_espera: number | null;
  calificacion_app: number | null;
  calificacion_trato: number | null;
  calificacion_general: number | null;
}

@Injectable()
export class SurveyService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(patientId: string, _branchId: number, answers: SurveyAnswer[]) {
    // Busca la ultima reservacion finalizada del paciente
    const reservacion = await this.prisma.reservaciones.findFirst({
      where: { id_paciente: patientId },
      orderBy: { fecha_programada: 'desc' },
    });
    if (!reservacion) {
      throw new NotFoundException(
        'No se encontro reservacion para el paciente',
      );
    }

    const cols: EncuestaCols = {
      calificacion_espera: null,
      calificacion_app: null,
      calificacion_trato: null,
      calificacion_general: null,
    };
    for (const a of answers) {
      const col = QUESTION_MAP[a.questionId];
      if (col) cols[col] = a.rating;
    }

    const created = await this.prisma.encuestas.create({
      data: {
        id_reservacion: reservacion.id,
        id_paciente: patientId,
        calificacion_general: cols.calificacion_general,
        calificacion_espera: cols.calificacion_espera,
        calificacion_trato: cols.calificacion_trato,
        calificacion_app: cols.calificacion_app,
        uso_app_checkin: true,
      },
    });

    return { ok: true, id: created.id.toString() };
  }

  /** KPI agregado para el dashboard de Salud Digna. */
  async satisfactionKpi() {
    const all = await this.prisma.encuestas.findMany();
    if (all.length === 0) return { totalResponses: 0, averageRating: 0 };

    const ratings = all
      .flatMap((e) => [
        e.calificacion_general,
        e.calificacion_espera,
        e.calificacion_trato,
        e.calificacion_app,
      ])
      .filter((n): n is number => n != null);

    const avg = ratings.reduce((acc, n) => acc + n, 0) / ratings.length;
    return {
      totalResponses: all.length,
      averageRating: Math.round(avg * 100) / 100,
    };
  }
}
