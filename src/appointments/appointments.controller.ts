import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AppointmentsService } from './appointments.service';
import { SchedulingService } from './scheduling.service';
import { CreateAppointmentDto } from './dto/appointment.dto';
import {
  CreateSmartAppointmentDto,
  RescheduleAppointmentDto,
} from './dto/smart-appointment.dto';

@Controller('reservaciones')
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

  /** Crea reservación usando IA para encontrar el mejor slot del día. */
  @Post('smart')
  @HttpCode(200)
  smartCreate(@Body() body: CreateSmartAppointmentDto) {
    return this.scheduling.smartCreate(body);
  }

  /**
   * Devuelve la lista de horarios disponibles del dia para un paquete
   * de estudios. Cada horario incluye su tiempo total estimado y nivel
   * de saturacion calculados por el modelo de IA.
   *
   * Query params:
   *   - branchId
   *   - date (YYYY-MM-DD)
   *   - studyIds (CSV: "2,5,11")
   *   - topN (default 8)
   */
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

  /**
   * Walk-in: paciente llega SIN cita. Encuentra el proximo hueco.
   * Query: branchId=46&studyIds=2,5
   */
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

  /** Reagenda inteligentemente una reservación existente. */
  @Post(':id/reschedule')
  @HttpCode(200)
  reschedule(@Param('id') id: string, @Body() body: RescheduleAppointmentDto) {
    return this.scheduling.reschedule(id, body);
  }

  /** Snapshot del plan vigente del paciente con reordenamiento dinámico. */
  @Get('paciente/:id/plan')
  livePlan(@Param('id') id: string) {
    return this.scheduling.livePlan(id);
  }

  /** SSE — push del plan + reordenamientos en vivo cada 5s. */
  @Sse('paciente/:id/plan/stream')
  livePlanStream(@Param('id') id: string): Observable<{ data: unknown }> {
    return this.scheduling.livePlanStream(id);
  }

  // ──────────────────────────────────────────────
  // Scheduler global de sucursal (in-memory clinic)
  // ──────────────────────────────────────────────

  /** Registra la llegada del paciente y dispara el re-plan global. */
  @Post(':id/arrival')
  @HttpCode(200)
  registerArrival(@Param('id') id: string) {
    return this.scheduling.registerArrivalAndReplan(id);
  }

  /** Marca el inicio de un estudio (consultorio empezó con el paciente). */
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

  /** Marca el fin de un estudio (consultorio se libera). */
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

  /** Saturación viva por sala (alimenta el dashboard). */
  @Get('clinic/:branchId/snapshot')
  clinicSnapshot(@Param('branchId') branchId: string) {
    return this.scheduling.clinicSnapshot(Number(branchId));
  }

  /** Plan global vigente (todos los pacientes + ETA + swaps). */
  @Get('clinic/:branchId/plan')
  clinicPlan(@Param('branchId') branchId: string) {
    return this.scheduling.clinicPlan(Number(branchId));
  }
}
