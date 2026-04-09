import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { StudiesController } from './studies.controller';
import { StudiesService } from './studies.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AiModule, AuthModule],
  controllers: [StudiesController],
  providers: [StudiesService],
  exports: [StudiesService],
})
export class StudiesModule {}
