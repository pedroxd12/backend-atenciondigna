import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AppointmentsService } from './appointments.service';
import { SchedulingService } from './scheduling.service';
import { CreateAppointmentDto } from './dto/appointment.dto';
import {
  CreateSmartAppointmentDto,
  RescheduleAppointmentDto,
} from './dto/smart-appointment.dto';

@Controller('reservaciones')
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(
    private readonly service: AppointmentsService,
    private readonly scheduling: SchedulingService,
  ) {}

  @Post()
  @HttpCode(200)
  create(@Body() body: CreateAppointmentDto) {
    return this.service.create(body);
  }

  @Get('paciente/:id')
  list(@Param('id') id: string) {
    return this.service.listForPatient(id);
  }

  // ──────────────────────────────────────────────
  // Agenda inteligente
  // ──────────────────────────────────────────────

  @Post('smart')
  @HttpCode(200)
  smartCreate(@Body() body: CreateSmartAppointmentDto) {
    return this.scheduling.smartCreate(body);
  }

  @Get('slots')
  availableSlots(
    @Query('branchId') branchId: string,
    @Query('date') date: string,
    @Query('studyIds') studyIds: string,
    @Query('topN') topN?: string,
  ) {
    return this.scheduling.availableSlots({
      branchId: Number(branchId),
      date,
      studyIds: studyIds
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n)),
      topN: topN ? Number(topN) : 8,
    });
  }

  @Get('check-time')
  checkTime(
    @Query('branchId') branchId: string,
    @Query('date') date: string,
    @Query('time') time: string,
    @Query('studyIds') studyIds: string,
  ) {
    return this.scheduling.checkTime({
      branchId: Number(branchId),
      date,
      time,
      studyIds: studyIds
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n)),
    });
  }

  @Get('walk-in')
  walkIn(
    @Query('branchId') branchId: string,
    @Query('studyIds') studyIds: string,
  ) {
    return this.scheduling.walkIn({
      branchId: Number(branchId),
      studyIds: studyIds
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n)),
    });
  }

  @Post(':id/reschedule')
  @HttpCode(200)
  reschedule(@Param('id') id: string, @Body() body: RescheduleAppointmentDto) {
    return this.scheduling.reschedule(id, body);
  }

  @Get('paciente/:id/plan')
  livePlan(@Param('id') id: string) {
    return this.scheduling.livePlan(id);
  }

  @Sse('paciente/:id/plan/stream')
  livePlanStream(@Param('id') id: string): Observable<{ data: unknown }> {
    return this.scheduling.livePlanStream(id);
  }

  // ──────────────────────────────────────────────
  // Scheduler global de sucursal (in-memory clinic)
  // ──────────────────────────────────────────────

  @Post(':id/arrival')
  @HttpCode(200)
  registerArrival(@Param('id') id: string) {
    return this.scheduling.registerArrivalAndReplan(id);
  }

  @Post('clinic/:branchId/patient/:patientId/study/:studyId/start')
  @HttpCode(200)
  startAttention(
    @Param('branchId') branchId: string,
    @Param('patientId') patientId: string,
    @Param('studyId') studyId: string,
  ) {
    return this.scheduling.startAttentionAndReplan(
      Number(branchId),
      patientId,
      Number(studyId),
    );
  }

  @Post('clinic/:branchId/patient/:patientId/study/:studyId/finish')
  @HttpCode(200)
  finishAttention(
    @Param('branchId') branchId: string,
    @Param('patientId') patientId: string,
    @Param('studyId') studyId: string,
  ) {
    return this.scheduling.finishAttentionAndReplan(
      Number(branchId),
      patientId,
      Number(studyId),
    );
  }

  @Get('clinic/:branchId/snapshot')
  clinicSnapshot(@Param('branchId') branchId: string) {
    return this.scheduling.clinicSnapshot(Number(branchId));
  }

  @Get('clinic/:branchId/plan')
  clinicPlan(@Param('branchId') branchId: string) {
    return this.scheduling.clinicPlan(Number(branchId));
  }
}
