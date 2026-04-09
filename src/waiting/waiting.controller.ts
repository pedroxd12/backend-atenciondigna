import { Controller, Get, Param, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { WaitingService, WaitStatus } from './waiting.service';

@Controller('pacientes')
export class WaitingController {
  constructor(private readonly waiting: WaitingService) {}

  @Get(':id/espera')
  current(@Param('id') id: string) {
    return this.waiting.current(id);
  }

  /** Cola de pacientes en el estudio actual del paciente. */
  @Get(':id/espera/cola')
  queue(@Param('id') id: string) {
    return this.waiting.queueForPatient(id);
  }

  /** SSE — el cliente Flutter recibe actualizaciones cada 3 s. */
  @Sse(':id/espera/stream')
  stream(@Param('id') id: string): Observable<{ data: WaitStatus }> {
    return this.waiting.stream(id);
  }
}
