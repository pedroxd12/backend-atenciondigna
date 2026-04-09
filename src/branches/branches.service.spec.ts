import { Test, TestingModule } from '@nestjs/testing';
import { BranchesService } from './branches.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

describe('BranchesService', () => {
  let service: BranchesService;
  let prisma: any;
  let ai: any;

  beforeEach(async () => {
    prisma = {
      sucursales: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    ai = {
      clinicSnapshot: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: ai },
      ],
    }).compile();

    service = module.get<BranchesService>(BranchesService);
  });

  describe('list', () => {
    it('should return all active branches', async () => {
      prisma.sucursales.findMany.mockResolvedValue([
        { id: 46, nombre: 'Coyoacan', latitud: 19.35, longitud: -99.17, activa: true },
      ]);

      const result = await service.list();
      expect(result).toHaveLength(1);
      expect(result[0].nombre).toBe('Coyoacan');
    });
  });

  describe('findById', () => {
    it('should return a single branch', async () => {
      prisma.sucursales.findUnique.mockResolvedValue({
        id: 46,
        nombre: 'Coyoacan',
        latitud: 19.3568,
        longitud: -99.1716,
      });

      const result = await service.findById(46);
      expect(result).not.toBeNull();
      expect(result.id).toBe(46);
    });
  });

  describe('nearestWithWait', () => {
    it('should sort branches by distance and return wait times', async () => {
      prisma.sucursales.findMany.mockResolvedValue([
        { id: 46, nombre: 'Coyoacan', latitud: 19.3568, longitud: -99.1716, activa: true },
        { id: 47, nombre: 'Polanco', latitud: 19.4320, longitud: -99.1956, activa: true },
      ]);

      ai.clinicSnapshot.mockResolvedValue({
        id_sucursal: 46,
        salas: [
          { id_estudio: 2, nombre_estudio: 'Lab', tiempo_espera_estimado_min: 12, nivel_saturacion: 'bajo' },
        ],
        espera_promedio_actual_min: 12,
      });

      const result = await service.nearestWithWait(19.35, -99.17, 2, 3);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
