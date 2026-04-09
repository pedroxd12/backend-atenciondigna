import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { BranchesService } from './branches.service';

@Controller('sucursales')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  list() {
    return this.branches.list();
  }

  /**
   * GET /sucursales/cercanas?lat=19.34&lng=-99.16&id_estudio=2&limit=3
   *
   * Si el cliente no envia lat/lng, el backend NO inventa coordenadas:
   * responde 400 para que la app maneje el caso (estado vacio "activa
   * tu ubicacion para ver sucursales cercanas").
   */
  @Get('cercanas')
  nearest(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('id_estudio') idEstudio?: string,
    @Query('limit') limit?: string,
  ) {
    if (!lat || !lng) {
      throw new HttpException(
        'Faltan parametros lat y lng para calcular la sucursal mas cercana',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.branches.nearestWithWait(
      Number(lat),
      Number(lng),
      idEstudio ? Number(idEstudio) : 2,
      limit ? Number(limit) : 3,
    );
  }

  @Get(':id')
  async one(@Param('id', ParseIntPipe) id: number) {
    const branch = await this.branches.findById(id);
    if (!branch) {
      throw new HttpException('Sucursal no encontrada', HttpStatus.NOT_FOUND);
    }
    return branch;
  }
}
