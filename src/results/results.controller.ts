import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ResultsService } from './results.service';

@Controller('pacientes')
export class ResultsController {
  constructor(private readonly results: ResultsService) {}

  @Get(':id/resultados')
  myResults(@Param('id') id: string) {
    return this.results.getMyResults(id);
  }
}

@Controller('resultados')
export class ResultsAdminController {
  constructor(private readonly results: ResultsService) {}

  /** Genera resúmenes IA para resultados disponibles sin resumen. */
  @Post('generar-resumenes')
  @HttpCode(200)
  generateSummaries() {
    return this.results.generateMissingSummaries().then((count) => ({
      generated: count,
      message: `${count} resúmenes generados`,
    }));
  }
}
