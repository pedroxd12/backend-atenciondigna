import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from "@nestjs/common";
import { CitasService } from "./citas.service";
import { CreatePacienteDto } from "./dto/create-paciente.dto";
import { CreateReservacionDto } from "./dto/create-reservacion.dto";

@Controller("citas")
export class CitasController {
  constructor(private readonly citasService: CitasService) {}

  /* ------------------------------------------------------------------ */
  /*  Pacientes                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * POST /citas/pacientes
   * Registra un nuevo paciente. Si ya existe un perfil asociado al
   * firebase_uid proporcionado, devuelve el registro existente.
   */
  @Post("pacientes")
  @HttpCode(HttpStatus.CREATED)
  registrarPaciente(@Body() dto: CreatePacienteDto) {
    return this.citasService.registrarPaciente(dto);
  }

  /**
   * POST /citas/reservaciones
   * Crea una reservación con uno o más estudios para un paciente registrado.
   */
  @Post("reservaciones")
  @HttpCode(HttpStatus.CREATED)
  crearReservacion(@Body() dto: CreateReservacionDto) {
    return this.citasService.crearReservacion(dto);
  }


  @Get("reservaciones/:id/qr")
  getReservacionQr(@Param("id", ParseIntPipe) id: number) {
    return this.citasService.getReservacionQrView(BigInt(id));
  }
}
