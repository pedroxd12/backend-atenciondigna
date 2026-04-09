import { Injectable, NotFoundException } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';

export interface StudyDto {
  id: number;
  name: string;
  area: string;
  estimatedMinutes: number;
  requiresPreparation: boolean;
  preparations: string[];
  requiresMedicalOrder: boolean;
}

@Injectable()
export class StudiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  /**
   * Devuelve los estudios del dia para `patientId`, ya en el orden recomendado
   * por el motor IA + reglas de secuencias obligatorias.
   */
  async getTodaysStudies(patientId: string): Promise<StudyDto[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const reservacion = await this.prisma.reservaciones.findFirst({
      where: {
        id_paciente: patientId,
        fecha_programada: { gte: today, lt: tomorrow },
        estado: { in: ['pendiente', 'confirmada', 'en_proceso'] },
      },
      include: {
        reservaciones_servicios: {
          include: { estudios: true, sucursales_consultorios: true },
          orderBy: { orden_atencion: 'asc' },
        },
      },
      orderBy: { hora_programada: 'asc' },
    });

    if (!reservacion) {
      throw new NotFoundException(
        'No se encontro reservacion activa para hoy',
      );
    }

    const idEstudios = reservacion.reservaciones_servicios.map(
      (s) => s.id_estudio,
    );

    // Pide al microservicio IA el orden + tiempos
    const hora = today.getHours();
    const diaSemana = (today.getDay() + 6) % 7;
    let aiOrder: { id_estudio: number; tiempo_espera_pred_min: number }[];
    try {
      const batch = await this.ai.predictBatch({
        id_sucursal: reservacion.id_sucursal,
        hora,
        dia_semana: diaSemana,
        estudios: idEstudios,
      });
      aiOrder = batch.predicciones;
    } catch {
      aiOrder = idEstudios.map((id) => ({
        id_estudio: id,
        tiempo_espera_pred_min: 15,
      }));
    }

    // Persiste los tiempos predichos en cada servicio (para el dashboard)
    await Promise.all(
      aiOrder.map((p) =>
        this.prisma.reservaciones_servicios
          .updateMany({
            where: {
              id_reservacion: reservacion.id,
              id_estudio: p.id_estudio,
            },
            data: { tiempo_espera_predicho_min: Math.round(p.tiempo_espera_pred_min) },
          })
          .catch(() => undefined),
      ),
    );

    // Mapea cada item al DTO usando el catalogo `estudios`
    return aiOrder.map((p) => {
      const srv = reservacion.reservaciones_servicios.find(
        (s) => s.id_estudio === p.id_estudio,
      );
      const meta = srv?.estudios;
      const area =
        srv?.sucursales_consultorios?.area_nombre ??
        meta?.nombre ??
        'Por definir';

      return {
        id: p.id_estudio,
        name: meta?.nombre ?? `Estudio ${p.id_estudio}`,
        area,
        estimatedMinutes: p.tiempo_espera_pred_min,
        requiresPreparation: meta?.requiere_preparacion ?? false,
        preparations: this.preparationsFor(meta),
        requiresMedicalOrder: meta?.requiere_orden_medica ?? false,
      };
    });
  }

  /**
   * Catalogo completo de estudios activos — fuente unica para selectores
   * en la app (request_service_page, etc.). Reemplaza listas hardcodeadas.
   */
  async getCatalogo(): Promise<
    {
      id: number;
      nombre: string;
      requierePreparacion: boolean;
      requiereOrdenMedica: boolean;
      tiempoEsperaPromedio: number;
    }[]
  > {
    const estudios = await this.prisma.estudios.findMany({
      where: { activo: true },
      orderBy: [{ orden_prioridad: 'asc' }, { nombre: 'asc' }],
      select: {
        id: true,
        nombre: true,
        requiere_preparacion: true,
        requiere_orden_medica: true,
        tiempo_espera_promedio_min: true,
      },
    });

    return estudios.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      requierePreparacion: e.requiere_preparacion,
      requiereOrdenMedica: e.requiere_orden_medica,
      tiempoEsperaPromedio: e.tiempo_espera_promedio_min,
    }));
  }

  /**
   * Construye la lista de preparaciones a partir del catalogo. Si la
   * descripcion del estudio contiene texto, se separa por puntos.
   */
  private preparationsFor(
    estudio: { descripcion: string | null; max_vigencia_muestra_min: number | null } | undefined,
  ): string[] {
    if (!estudio) return [];
    const preps: string[] = [];
    if (estudio.descripcion) {
      preps.push(
        ...estudio.descripcion
          .split(/[.\n]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
      );
    }
    if (estudio.max_vigencia_muestra_min) {
      preps.push(
        `Si llevas muestra propia, no debe tener mas de ${estudio.max_vigencia_muestra_min} minutos`,
      );
    }
    return preps;
  }
}
