import {
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
}
