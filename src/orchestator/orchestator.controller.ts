import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { OrchestatorService } from "./orchestator.service";
import { RegisterVisitDto } from "./dto/register-visit.dto";
import { StudyType } from "./enums/index";

@Controller("orchestator")
export class OrchestatorController {
  constructor(private readonly orchestatorService: OrchestatorService) {}

  /** Registrar una nueva visita con sus estudios */
  @Post("visit")
  @HttpCode(HttpStatus.CREATED)
  registerVisit(@Body() dto: RegisterVisitDto) {
    return this.orchestatorService.registerVisit(dto);
  }

  /** Obtener el estado de una visita */
  @Get("visit/:visitId")
  getVisit(@Param("visitId") visitId: string) {
    const visit = this.orchestatorService.getVisit(visitId);
    if (!visit) throw new NotFoundException(`Visita ${visitId} no encontrada.`);
    return visit;
  }

  /** Marcar un estudio como completado y desbloquear dependientes */
  @Patch("visit/:visitId/complete/:studyType")
  completeStudy(
    @Param("visitId") visitId: string,
    @Param("studyType") studyType: StudyType,
  ) {
    if (!Object.values(StudyType).includes(studyType)) {
      throw new BadRequestException(`Tipo de estudio inválido: ${studyType}`);
    }
    try {
      return this.orchestatorService.completeStudy(visitId, studyType);
    } catch (error) {
      throw new NotFoundException((error as Error).message);
    }
  }

  /** Resumen de todas las colas (cantidad de pacientes por estudio) */
  @Get("queues")
  getQueueSummary() {
    return this.orchestatorService.getQueueSummary();
  }

  /** Detalle de la cola de un tipo de estudio específico */
  @Get("queues/:studyType")
  getQueue(@Param("studyType") studyType: StudyType) {
    if (!Object.values(StudyType).includes(studyType)) {
      throw new BadRequestException(`Tipo de estudio inválido: ${studyType}`);
    }
    return this.orchestatorService.getQueue(studyType);
  }
}
