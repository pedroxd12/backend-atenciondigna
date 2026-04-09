import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AiModule } from './ai/ai.module';
import { BranchesModule } from './branches/branches.module';
import { StudiesModule } from './studies/studies.module';
import { CheckinModule } from './checkin/checkin.module';
import { WaitingModule } from './waiting/waiting.module';
import { SurveyModule } from './survey/survey.module';
import { ResultsModule } from './results/results.module';
import { ServicesModule } from './services/services.module';
import { MapsModule } from './maps/maps.module';
import { TrackingModule } from './tracking/tracking.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AppointmentsModule,
    AiModule,
    BranchesModule,
    StudiesModule,
    CheckinModule,
    WaitingModule,
    SurveyModule,
    ResultsModule,
    ServicesModule,
    MapsModule,
    TrackingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
