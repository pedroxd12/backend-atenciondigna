import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RealTimeModule } from './real_time/real_time.module';

@Module({
  imports: [RealTimeModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
