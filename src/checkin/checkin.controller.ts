import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { CheckinService } from './checkin.service';
import { GeneratePassDto, ValidateClinicalDto } from './dto/checkin.dto';

@Controller('checkin')
export class CheckinController {
  constructor(private readonly checkin: CheckinService) {}

  @Post('pase')
  @HttpCode(200)
  generate(@Body() body: GeneratePassDto) {
    return this.checkin.generatePass(body);
  }

  @Post('validacion-clinica')
  @HttpCode(200)
  validate(@Body() body: ValidateClinicalDto) {
    return this.checkin.validateClinicalRules(body);
  }

  /** Endpoint usado por la app del receptor para canjear el QR. */
  @Post('canjear/:token')
  @HttpCode(200)
  redeem(@Param('token') token: string) {
    const pass = this.checkin.redeemPass(token);
    if (!pass) throw new NotFoundException('Pase invalido o expirado');
    return pass;
  }

  /**
   * GAP 12: Endpoint para que el recepcionista haga check-in escaneando
   * el QR del paciente desde el dashboard.
   *
   * El payload del QR es: "AD|<token>|<patientId>|<branchId>|<studyIds>"
   * El dashboard envía el string crudo y este endpoint lo parsea y canjea.
   */
  @Post('canjear-qr')
  @HttpCode(200)
  async redeemByQr(@Body() body: { qrPayload: string }) {
    if (!body.qrPayload) {
      throw new BadRequestException('qrPayload es requerido');
    }

    const parts = body.qrPayload.split('|');
    if (parts.length < 2 || parts[0] !== 'AD') {
      throw new BadRequestException('Formato de QR invalido. Esperado: AD|token|...');
    }

    const token = parts[1];
    const pass = await this.checkin.redeemPass(token);
    if (!pass) throw new NotFoundException('Pase invalido o expirado');
    return pass;
  }
}
