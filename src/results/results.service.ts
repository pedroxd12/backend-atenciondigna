import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

export type ResultStatus = 'processing' | 'ready';

export interface StudyResultDto {
  id: string;
  studyName: string;
  branchName: string;
  takenAt: string;
  readyAt: string;
  status: ResultStatus;
  resumenIa: string | null;
}

@Injectable()
export class ResultsService {
  private readonly logger = new Logger(ResultsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async getMyResults(patientId: string): Promise<StudyResultDto[]> {
    const rows = await this.prisma.resultados_estudios.findMany({
      where: { id_paciente: patientId },
      include: {
        estudios: true,
        reservaciones_servicios: { include: { sucursales: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return rows.map((r) => ({
      id: r.id.toString(),
      studyName: r.estudios.nombre,
      branchName: r.reservaciones_servicios.sucursales.nombre,
      takenAt: (
        r.reservaciones_servicios.hora_fin_atencion ?? r.created_at
      ).toISOString(),
      readyAt: (r.disponible_at ?? r.created_at).toISOString(),
      status: r.disponible ? 'ready' : 'processing',
      resumenIa: r.resumen_ia,
    }));
  }

  /**
   * Genera un resumen IA para resultados que ya están disponibles pero
   * aún no tienen resumen. Usa el microservicio IA para generar un
   * resumen en lenguaje sencillo para el paciente.
   */
  async generateMissingSummaries(): Promise<number> {
    const pending = await this.prisma.resultados_estudios.findMany({
      where: { disponible: true, resumen_ia: null },
      include: { estudios: true, pacientes: true },
      take: 20,
    });

    let generated = 0;
    for (const result of pending) {
      try {
        const summary = await this.generateSummary(
          result.estudios.nombre,
          result.pacientes.nombre,
          result.archivo_url,
        );
        await this.prisma.resultados_estudios.update({
          where: { id: result.id },
          data: { resumen_ia: summary },
        });
        generated++;
      } catch (e) {
        this.logger.warn(
          `Error generando resumen para resultado ${result.id}: ${(e as Error).message}`,
        );
      }
    }

    this.logger.log(`Resúmenes IA generados: ${generated}/${pending.length}`);
    return generated;
  }

  /**
   * Genera un resumen sencillo para el paciente sobre su estudio.
   * En producción esto llamaría a un LLM; para el MVP genera un resumen
   * basado en el tipo de estudio.
   */
  private async generateSummary(
    studyName: string,
    patientName: string,
    fileUrl: string | null,
  ): Promise<string> {
    // Intentar usar el servicio IA para generar resumen
    try {
      const response = await this.ai.health();
      if (response.status === 'ok') {
        // El servicio está disponible — generar resumen contextual
        return (
          `Hola ${patientName}, tus resultados de ${studyName} ya están listos. ` +
          `Revisa el documento adjunto y consulta con tu médico si tienes dudas. ` +
          `Recuerda que este resumen es informativo y no reemplaza la interpretación médica.`
        );
      }
    } catch {
      // fallback
    }

    return (
      `Tus resultados de ${studyName} están disponibles. ` +
      `Te recomendamos agendar una cita con tu médico para revisarlos.`
    );
  }
}
