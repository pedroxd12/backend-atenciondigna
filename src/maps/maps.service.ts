import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';

interface StaticMapParams {
  lat: number;
  lng: number;
  zoom: number;
  width: number;
  height: number;
  /** Pares "lat,lng" separados por "|" para marcadores secundarios. */
  markers?: string;
  /** Marcador destacado en formato "lat,lng" (verde Salud Digna). */
  highlight?: string;
}

/**
 * Cliente del Google Static Maps API.
 *
 * La API key se lee de la variable de entorno `GOOGLE_MAPS_API` (la misma
 * que el equipo ya tenia configurada en el .env). Si no esta presente, los
 * endpoints devuelven 503 para que la app pueda mostrar un estado vacio en
 * lugar de imagenes rotas o datos inventados.
 */
@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name);
  private readonly endpoint = 'https://maps.googleapis.com/maps/api/staticmap';

  get apiKey(): string | undefined {
    return process.env.GOOGLE_MAPS_API ?? process.env.GOOGLE_MAPS_API_KEY;
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 10);
  }

  async fetchStaticMap(params: StaticMapParams): Promise<Buffer> {
    const key = this.apiKey;
    if (!key) {
      throw new HttpException(
        'GOOGLE_MAPS_API no configurada',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const qs = new URLSearchParams({
      center: `${params.lat},${params.lng}`,
      zoom: String(params.zoom),
      size: `${params.width}x${params.height}`,
      scale: '2',
      maptype: 'roadmap',
      key,
    });

    // Marcador destacado (verde) — usado para "tu sucursal seleccionada"
    if (params.highlight) {
      qs.append('markers', `color:0x1FA45A|size:mid|${params.highlight}`);
    }

    // Marcadores secundarios (azules)
    if (params.markers) {
      const list = params.markers.split('|').filter((p) => p.trim().length > 0);
      if (list.length > 0) {
        qs.append('markers', `color:0x1E3A5F|size:small|${list.join('|')}`);
      }
    }

    // Si no hay marcadores explicitos, usa el centro como pin
    if (!params.markers && !params.highlight) {
      qs.append(
        'markers',
        `color:0x1FA45A|size:mid|${params.lat},${params.lng}`,
      );
    }

    const url = `${this.endpoint}?${qs.toString()}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.error(
          `Google Static Maps respondio ${res.status}: ${text.slice(0, 200)}`,
        );
        throw new HttpException(
          'No se pudo obtener el mapa de Google',
          HttpStatus.BAD_GATEWAY,
        );
      }
      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (e) {
      if (e instanceof HttpException) throw e;
      this.logger.error(`Error de red llamando a Google Static Maps`, e as Error);
      throw new HttpException(
        'No se pudo conectar con Google Maps',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
