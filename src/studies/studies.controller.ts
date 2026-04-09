import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StudiesService } from './studies.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class StudiesController {
  constructor(private readonly studies: StudiesService) {}

  @Get('pacientes/:id/estudios-hoy')
  todaysStudies(@Param('id') id: string) {
    return this.studies.getTodaysStudies(id);
  }

  @Get('estudios')
  catalogo() {
    return this.studies.getCatalogo();
  }
}
