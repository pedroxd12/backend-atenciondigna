import { Module } from "@nestjs/common";
import { OrchestatorController } from "./orchestator.controller";
import { OrchestatorService } from "./orchestator.service";

@Module({
  controllers: [OrchestatorController],
  providers: [OrchestatorService],
  exports: [OrchestatorService],
})
export class OrchestatorModule {}
