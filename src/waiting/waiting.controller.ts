import { Controller, Get, Param, Sse, UseGuards } from '@nestjs/common';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WaitingService, WaitStatus } from './waiting.service';

@Controller('pacientes')
@UseGuards(JwtAuthGuard)
export class WaitingController {
  constructor(private readonly waiting: WaitingService) {}

  @Get(':id/espera')
  current(@Param('id') id: string) {
    return this.waiting.current(id);
  }

  @Get(':id/espera/cola')
  queue(@Param('id') id: string) {
    return this.waiting.queueForPatient(id);
  }

  @Sse(':id/espera/stream')
  stream(@Param('id') id: string): Observable<{ data: WaitStatus }> {
    return this.waiting.stream(id);
  }
}
