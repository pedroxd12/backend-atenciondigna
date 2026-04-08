import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type ResultStatus = 'processing' | 'ready';

export interface StudyResultDto {
  id: string;
  studyName: string;
  branchName: string;
  takenAt: string;
  readyAt: string;
  status: ResultStatus;
}

@Injectable()
export class ResultsService {
  constructor(private readonly prisma: PrismaService) {}

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
    }));
  }
}
