import { Controller, Get, Param } from '@nestjs/common';
import { ResultsService } from './results.service';

@Controller('pacientes')
export class ResultsController {
  constructor(private readonly results: ResultsService) {}

  @Get(':id/resultados')
  myResults(@Param('id') id: string) {
    return this.results.getMyResults(id);
  }
}
