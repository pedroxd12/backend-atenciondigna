import { Controller, Get, Param } from '@nestjs/common';
import { StudiesService } from './studies.service';

@Controller('pacientes')
export class StudiesController {
  constructor(private readonly studies: StudiesService) {}

  @Get(':id/estudios-hoy')
  todaysStudies(@Param('id') id: string) {
    return this.studies.getTodaysStudies(id);
  }
}
