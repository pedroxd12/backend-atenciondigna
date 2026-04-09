import { Module } from '@nestjs/common';
import { CheckinController } from './checkin.controller';
import { CheckinService } from './checkin.service';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AppointmentsModule, AiModule],
  controllers: [CheckinController],
  providers: [CheckinService],
  exports: [CheckinService],
})
export class CheckinModule {}
