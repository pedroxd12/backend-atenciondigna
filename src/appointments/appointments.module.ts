import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { SchedulingService } from './scheduling.service';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AiModule, AuthModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, SchedulingService],
  exports: [AppointmentsService, SchedulingService],
})
export class AppointmentsModule {}
