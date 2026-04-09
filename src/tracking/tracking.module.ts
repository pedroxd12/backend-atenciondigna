import { Module } from '@nestjs/common';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
import { NotificationsService } from '../common/notifications.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [TrackingController],
  providers: [TrackingService, NotificationsService],
  exports: [TrackingService],
})
export class TrackingModule {}
