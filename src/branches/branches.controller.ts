import { Controller, Get, Query } from '@nestjs/common';
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
   */
  @Get('cercanas')
  nearest(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('id_estudio') idEstudio?: string,
    @Query('limit') limit?: string,
  ) {
    return this.branches.nearestWithWait(
      lat ? Number(lat) : 19.3417,
      lng ? Number(lng) : -99.1612,
      idEstudio ? Number(idEstudio) : 2,
      limit ? Number(limit) : 3,
    );
  }
}
