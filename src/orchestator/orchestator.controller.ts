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


  @Post("visit")
  @HttpCode(HttpStatus.CREATED)
  registerVisit(@Body() dto: RegisterVisitDto) {
    return this.orchestatorService.registerVisit(dto);
  }

  
  @Get("visit/:visitId")
  getVisit(@Param("visitId") visitId: string) {
    const visit = this.orchestatorService.getVisit(visitId);
    if (!visit) throw new NotFoundException(`Visita ${visitId} no encontrada.`);
    return visit;
  }


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


  @Get("queues")
  getQueueSummary() {
    return this.orchestatorService.getQueueSummary();
  }


  @Get("queues/:studyType")
  getQueue(@Param("studyType") studyType: StudyType) {
    if (!Object.values(StudyType).includes(studyType)) {
      throw new BadRequestException(`Tipo de estudio inválido: ${studyType}`);
    }
    return this.orchestatorService.getQueue(studyType);
  }
}
