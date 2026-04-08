import { Module } from '@nestjs/common';
import { WaitingController } from './waiting.controller';
import { WaitingService } from './waiting.service';

@Module({
  controllers: [WaitingController],
  providers: [WaitingService],
  exports: [WaitingService],
})
export class WaitingModule {}
