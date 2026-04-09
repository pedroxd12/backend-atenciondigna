import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ResultsService } from './results.service';

@Controller('pacientes')
@UseGuards(JwtAuthGuard)
export class ResultsController {
  constructor(private readonly results: ResultsService) {}

  @Get(':id/resultados')
  myResults(@Param('id') id: string) {
    return this.results.getMyResults(id);
  }
}

@Controller('resultados')
@UseGuards(JwtAuthGuard)
export class ResultsAdminController {
  constructor(private readonly results: ResultsService) {}

  @Post('generar-resumenes')
  @HttpCode(200)
  generateSummaries() {
    return this.results.generateMissingSummaries().then((count) => ({
      generated: count,
      message: `${count} resúmenes generados`,
    }));
  }
}
