import { Module } from '@nestjs/common';
import { WaitingController } from './waiting.controller';
import { WaitingService } from './waiting.service';
import { NotificationsService } from '../common/notifications.service';

@Module({
  controllers: [WaitingController],
  providers: [WaitingService, NotificationsService],
  exports: [WaitingService],
})
export class WaitingModule {}
