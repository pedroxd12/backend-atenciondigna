import { Module } from '@nestjs/common';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
import { NotificationsService } from '../common/notifications.service';

@Module({
  controllers: [TrackingController],
  providers: [TrackingService, NotificationsService],
  exports: [TrackingService],
})
export class TrackingModule {}
