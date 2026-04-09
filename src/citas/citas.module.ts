import { Module } from '@nestjs/common';
import { CitasController } from './citas.controller';
import { CitasService } from './citas.service';
import { QrService } from './qr/qr.service';

@Module({
	controllers: [CitasController],
	providers: [CitasService, QrService],
	exports: [CitasService],
})
export class CitasModule {}
