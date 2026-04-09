import { Module } from '@nestjs/common';
import { CheckinController } from './checkin.controller';
import { CheckinService } from './checkin.service';
import { AppointmentsModule } from '../appointments/appointments.module';

@Module({
  imports: [AppointmentsModule],
  controllers: [CheckinController],
  providers: [CheckinService],
  exports: [CheckinService],
})
export class CheckinModule {}
