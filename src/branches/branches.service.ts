import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  haversineKm,
  levelFromMinutes,
  SaturationLevel,
} from '../common/saturation';

export interface BranchDto {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface BranchWithWaitDto extends BranchDto {
  distanceKm: number;
  waitTimeMinutes: number;
  saturationLevel: SaturationLevel;
}

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async list(): Promise<BranchDto[]> {
    const rows = await this.prisma.sucursales.findMany({
      where: { activa: true },
      orderBy: { id: 'asc' },
    });
    return rows.map(this.toBranchDto);
  }

  /**
   * Devuelve las N sucursales mas cercanas a (lat, lng) con su tiempo de
   * espera predicho por el microservicio IA. Tambien persiste cada
   * prediccion en `predicciones_ia` para que el dashboard tenga historico.
   */
  async nearestWithWait(
    lat: number,
    lng: number,
    idEstudio: number,
    limit = 3,
  ): Promise<BranchWithWaitDto[]> {
    const sucursales = await this.prisma.sucursales.findMany({
      where: { activa: true },
    });

    const ranked = sucursales
      .map((s) => ({
        s,
        distanceKm: haversineKm(
          lat,
          lng,
          Number(s.latitud ?? 0),
          Number(s.longitud ?? 0),
        ),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);

    const now = new Date();
    const hora = now.getHours();
    const diaSemana = (now.getDay() + 6) % 7;

    const enriched = await Promise.all(
      ranked.map(async ({ s, distanceKm }) => {
        let pred: { tiempo: number; nivel: SaturationLevel };
        try {
          const aiPred = await this.ai.predict({
            id_sucursal: s.id,
            id_estudio: idEstudio,
            hora,
            dia_semana: diaSemana,
          });
          pred = {
            tiempo: aiPred.tiempo_espera_pred_min,
            nivel: aiPred.nivel_saturacion,
          };

          // Cachea la prediccion para el dashboard
          await this.prisma.predicciones_ia
            .create({
              data: {
                id_sucursal: s.id,
                id_estudio: idEstudio,
                fecha_prediccion: new Date(
                  now.getFullYear(),
                  now.getMonth(),
                  now.getDate(),
                ),
                hora_prediccion: hora,
                tiempo_espera_pred_min: aiPred.tiempo_espera_pred_min,
                score_confianza: aiPred.score_confianza,
                modelo: aiPred.modelo,
                nivel_saturacion: aiPred.nivel_saturacion,
              },
            })
            .catch(() => undefined);
        } catch {
          pred = { tiempo: 15, nivel: 'medio' };
        }

        return {
          ...this.toBranchDto(s),
          distanceKm,
          waitTimeMinutes: pred.tiempo,
          saturationLevel: pred.nivel ?? levelFromMinutes(pred.tiempo),
        };
      }),
    );

    return enriched.sort((a, b) => a.waitTimeMinutes - b.waitTimeMinutes);
  }

  private toBranchDto = (s: {
    id: number;
    nombre: string;
    direccion: string | null;
    latitud: unknown;
    longitud: unknown;
  }): BranchDto => ({
    id: s.id,
    name: s.nombre,
    address: s.direccion ?? '',
    lat: Number(s.latitud ?? 0),
    lng: Number(s.longitud ?? 0),
  });
}
