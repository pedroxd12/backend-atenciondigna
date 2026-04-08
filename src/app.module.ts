import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { SucursalesModule } from './sucursales/sucursales.module';
import { PacientesModule } from './pacientes/pacientes.module';

@Module({
  imports: [SucursalesModule, PacientesModule],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
