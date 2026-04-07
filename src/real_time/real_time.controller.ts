import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { RealTimeGateway } from './real_time.gateway';
import { ResponseEventDto } from './dto/response-event.dto';

/**
 * Recibe el webhook que envía el microservicio FastAPI
 * cuando genera una respuesta y la difunde via WebSocket.
 *
 * FastAPI debe llamar:  POST /real-time/webhook
 */
@Controller('real-time')
export class RealTimeController {
  constructor(private readonly gateway: RealTimeGateway) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  handleWebhook(@Body() dto: ResponseEventDto) {
    this.gateway.broadcastResponse(dto);
    return { ok: true };
  }
}
