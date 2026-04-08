import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/appointment.dto';

@Controller('reservaciones')
export class AppointmentsController {
  constructor(private readonly service: AppointmentsService) {}

  @Post()
  @HttpCode(200)
  create(@Body() body: CreateAppointmentDto) {
    return this.service.create(body);
  }

  @Get('paciente/:id')
  list(@Param('id') id: string) {
    return this.service.listForPatient(id);
  }
}
