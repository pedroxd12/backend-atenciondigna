import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
