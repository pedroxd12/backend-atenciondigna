import { Module } from '@nestjs/common';
import { ResultsController, ResultsAdminController } from './results.controller';
import { ResultsService } from './results.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [ResultsController, ResultsAdminController],
  providers: [ResultsService],
  exports: [ResultsService],
})
export class ResultsModule {}
