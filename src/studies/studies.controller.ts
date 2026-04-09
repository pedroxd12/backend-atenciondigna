import { Controller, Get, Param } from '@nestjs/common';
import { StudiesService } from './studies.service';

@Controller()
export class StudiesController {
  constructor(private readonly studies: StudiesService) {}

  @Get('pacientes/:id/estudios-hoy')
  todaysStudies(@Param('id') id: string) {
    return this.studies.getTodaysStudies(id);
  }

  /** Catalogo completo de estudios disponibles (para selectores en la app). */
  @Get('estudios')
  catalogo() {
    return this.studies.getCatalogo();
  }
}
