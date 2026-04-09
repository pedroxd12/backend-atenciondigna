import { Module } from '@nestjs/common';
import { WaitingController } from './waiting.controller';
import { WaitingService } from './waiting.service';
import { NotificationsService } from '../common/notifications.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [WaitingController],
  providers: [WaitingService, NotificationsService],
  exports: [WaitingService],
})
export class WaitingModule {}
