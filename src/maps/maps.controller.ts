import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { MapsService } from './maps.service';

/**
 * Proxy del API de Google Maps. La key vive en backend (.env)
 * y nunca se expone al cliente.
 *
 *   GET /maps/static?lat=...&lng=...&zoom=...&width=...&height=...
 *       &markers=lat,lng|lat,lng
 */
@Controller('maps')
export class MapsController {
  constructor(private readonly maps: MapsService) {}

  @Get('config')
  config() {
    return { configured: this.maps.isConfigured };
  }

  @Get('static')
  async static(
    @Res() res: Response,
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('zoom') zoom?: string,
    @Query('width') width?: string,
    @Query('height') height?: string,
    @Query('markers') markers?: string,
    @Query('highlight') highlight?: string,
  ) {
    if (!lat || !lng) {
      throw new HttpException(
        'Faltan parametros lat/lng',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!this.maps.isConfigured) {
      throw new HttpException(
        'GOOGLE_MAPS_API no esta configurada en el servidor',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const buffer = await this.maps.fetchStaticMap({
      lat: Number(lat),
      lng: Number(lng),
      zoom: zoom ? Number(zoom) : 14,
      width: width ? Number(width) : 640,
      height: height ? Number(height) : 360,
      markers,
      highlight,
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(buffer);
  }
}
