import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { PacientesService } from './pacientes.service';

@Controller('pacientes')
export class PacientesController {
  constructor(private readonly pacientesService: PacientesService) {}

  @Post('sync')
  async syncFirebaseUser(
    @Body('firebase_uid') firebaseUid: string,
    @Body('nombre') nombre: string,
    @Body('email') email: string,
  ) {
    return this.pacientesService.syncPatient(firebaseUid, { nombre, email });
  }

  @Get(':id')
  async getProfile(@Param('id') id: string) {
    return this.pacientesService.getProfile(id);
  }
}