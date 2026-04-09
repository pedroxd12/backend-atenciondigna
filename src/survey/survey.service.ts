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
    if (all.length === 0) {
      return {
        totalResponses: 0,
        averageRating: 0,
        breakdown: {
          espera: { avg: 0, count: 0 },
          app: { avg: 0, count: 0 },
          trato: { avg: 0, count: 0 },
          general: { avg: 0, count: 0 },
        },
        nps: 0,
        trends: { improving: false, delta: 0 },
      };
    }

    const avg = (arr: (number | null)[]) => {
      const nums = arr.filter((n): n is number => n != null);
      return nums.length > 0
        ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100
        : 0;
    };

    const esperaRatings = all.map((e) => e.calificacion_espera);
    const appRatings = all.map((e) => e.calificacion_app);
    const tratoRatings = all.map((e) => e.calificacion_trato);
    const generalRatings = all.map((e) => e.calificacion_general);

    const allRatings = [...esperaRatings, ...appRatings, ...tratoRatings, ...generalRatings]
      .filter((n): n is number => n != null);
    const overallAvg = allRatings.length > 0
      ? Math.round((allRatings.reduce((a, b) => a + b, 0) / allRatings.length) * 100) / 100
      : 0;

    // NPS: % promotores (4-5) - % detractores (1-2) sobre calificacion_general
    const generalNums = generalRatings.filter((n): n is number => n != null);
    const promoters = generalNums.filter((n) => n >= 4).length;
    const detractors = generalNums.filter((n) => n <= 2).length;
    const nps = generalNums.length > 0
      ? Math.round(((promoters - detractors) / generalNums.length) * 100)
      : 0;

    // Trend: comparar primera mitad vs segunda mitad
    const half = Math.floor(all.length / 2);
    const firstHalf = all.slice(0, half);
    const secondHalf = all.slice(half);
    const avgFirst = avg(firstHalf.flatMap((e) => [e.calificacion_general]));
    const avgSecond = avg(secondHalf.flatMap((e) => [e.calificacion_general]));

    return {
      totalResponses: all.length,
      averageRating: overallAvg,
      breakdown: {
        espera: { avg: avg(esperaRatings), count: esperaRatings.filter((n) => n != null).length },
        app: { avg: avg(appRatings), count: appRatings.filter((n) => n != null).length },
        trato: { avg: avg(tratoRatings), count: tratoRatings.filter((n) => n != null).length },
        general: { avg: avg(generalRatings), count: generalNums.length },
      },
      nps,
      trends: {
        improving: avgSecond > avgFirst,
        delta: Math.round((avgSecond - avgFirst) * 100) / 100,
      },
    };
  }
}
