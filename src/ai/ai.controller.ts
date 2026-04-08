import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { AiService } from './ai.service';
import { BatchPredictDto, PredictDto } from './dto/predict.dto';

/**
 * Proxy hacia el microservicio IA. Mantenemos las rutas bajo `/ia/*`
 * para que el frontend (app móvil + dashboard) hable solo con el backend Nest.
 */
@Controller('ia')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('health')
  health() {
    return this.ai.health();
  }

  @Get('model/info')
  modelInfo() {
    return this.ai.modelInfo();
  }

  @Post('predict')
  predict(@Body() body: PredictDto) {
    return this.ai.predict(body);
  }

  @Post('predict/batch')
  predictBatch(@Body() body: BatchPredictDto) {
    return this.ai.predictBatch(body);
  }

  @Get('sucursal/:id/saturacion')
  saturacion(
    @Param('id', ParseIntPipe) id: number,
    @Query('hora') hora?: string,
    @Query('dia_semana') diaSemana?: string,
  ) {
    return this.ai.saturacion(
      id,
      hora ? Number(hora) : 7,
      diaSemana ? Number(diaSemana) : 3,
    );
  }
}
