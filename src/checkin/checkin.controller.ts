import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CheckinService } from './checkin.service';
import { GeneratePassDto, ValidateClinicalDto } from './dto/checkin.dto';

@Controller('checkin')
@UseGuards(JwtAuthGuard)
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

  @Post('canjear/:token')
  @HttpCode(200)
  redeem(@Param('token') token: string) {
    const pass = this.checkin.redeemPass(token);
    if (!pass) throw new NotFoundException('Pase invalido o expirado');
    return pass;
  }

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
