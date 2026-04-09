import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SurveyService, SurveyAnswer } from './survey.service';

class SubmitSurveyDto {
  patientId!: string;
  branchId!: number;
  answers!: SurveyAnswer[];
}

@Controller('encuestas')
@UseGuards(JwtAuthGuard)
export class SurveyController {
  constructor(private readonly survey: SurveyService) {}

  @Post()
  @HttpCode(200)
  submit(@Body() body: SubmitSurveyDto) {
    return this.survey.submit(body.patientId, body.branchId, body.answers);
  }

  @Get('kpi')
  kpi() {
    return this.survey.satisfactionKpi();
  }
}
