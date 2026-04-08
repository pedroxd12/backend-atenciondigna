import { Module } from "@nestjs/common";
import { RealTimeGateway } from "./real_time.gateway";
import { RealTimeController } from "./real_time.controller";

@Module({
  controllers: [RealTimeController],
  providers: [RealTimeGateway],
  exports: [RealTimeGateway],
})
export class RealTimeModule {}
