import { Test, TestingModule } from '@nestjs/testing';
import { SurveyService } from './survey.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SurveyService', () => {
  let service: SurveyService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      reservaciones: { findFirst: jest.fn() },
      encuestas: {
        create: jest.fn(),
        aggregate: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SurveyService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SurveyService>(SurveyService);
  });

  describe('submit', () => {
    it('should submit a survey successfully', async () => {
      prisma.reservaciones.findFirst.mockResolvedValue({
        id: BigInt(1),
        id_paciente: 'patient-1',
      });
      prisma.encuestas.create.mockResolvedValue({
        id: BigInt(1),
        calificacion_general: 5,
        calificacion_espera: 4,
        calificacion_trato: 5,
        calificacion_app: 4,
      });

      const result = await service.submit('patient-1', 46, [
        { questionId: 'espera', rating: 4 },
        { questionId: 'app', rating: 4 },
        { questionId: 'trato', rating: 5 },
        { questionId: 'general', rating: 5 },
      ]);

      expect(result).toBeDefined();
      expect(prisma.encuestas.create).toHaveBeenCalled();
    });
  });

  describe('satisfactionKpi', () => {
    it('should return KPI data', async () => {
      prisma.encuestas.aggregate.mockResolvedValue({
        _avg: {
          calificacion_general: 4.2,
          calificacion_espera: 3.8,
          calificacion_trato: 4.5,
          calificacion_app: 4.0,
        },
      });
      prisma.encuestas.count.mockResolvedValue(50);

      const result = await service.satisfactionKpi();

      expect(result).toBeDefined();
      expect(result.totalResponses).toBe(50);
      expect(result.averageRating).toBeCloseTo(4.2, 1);
    });
  });
});
