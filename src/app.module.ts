import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { RealTimeModule } from "./real_time/real_time.module";
import { OrchestatorModule } from "./orchestator/orchestator.module";
import { PrismaModule } from "./prisma/prisma.module";
import { CitasModule } from "./citas/citas.module";

@Module({
  imports: [PrismaModule, RealTimeModule, OrchestatorModule, CitasModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
