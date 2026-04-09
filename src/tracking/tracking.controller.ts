import { Controller, Get, Param, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { TrackingService, TrackingStatus } from './tracking.service';

@Controller('tracking')
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  /** Estado completo del trayecto del paciente — tracking tipo Uber */
  @Get(':patientId')
  getStatus(@Param('patientId') patientId: string) {
    return this.tracking.getTrackingStatus(patientId);
  }

  /** SSE — actualizaciones cada 10s para la app móvil */
  @Sse(':patientId/stream')
  stream(
    @Param('patientId') patientId: string,
  ): Observable<{ data: TrackingStatus }> {
    return this.tracking.stream(patientId);
  }
}
