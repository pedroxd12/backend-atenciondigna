import { Module } from '@nestjs/common';
import { ResultsController, ResultsAdminController } from './results.controller';
import { ResultsService } from './results.service';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AiModule, AuthModule],
  controllers: [ResultsController, ResultsAdminController],
  providers: [ResultsService],
  exports: [ResultsService],
})
export class ResultsModule {}
