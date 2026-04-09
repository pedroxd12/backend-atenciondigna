import { Controller, Get, Param, Sse, UseGuards } from '@nestjs/common';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TrackingService, TrackingStatus } from './tracking.service';

@Controller('tracking')
@UseGuards(JwtAuthGuard)
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Get(':patientId')
  getStatus(@Param('patientId') patientId: string) {
    return this.tracking.getTrackingStatus(patientId);
  }

  @Sse(':patientId/stream')
  stream(
    @Param('patientId') patientId: string,
  ): Observable<{ data: TrackingStatus }> {
    return this.tracking.stream(patientId);
  }
}
