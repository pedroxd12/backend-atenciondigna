import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CheckinService } from './checkin.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { SchedulingService } from '../appointments/scheduling.service';

describe('CheckinService', () => {
  let service: CheckinService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      reservaciones: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      reservaciones_servicios: {
        findMany: jest.fn().mockResolvedValue([
          { id: BigInt(1), id_estudio: 2, id_sucursal: 46, estado: 'en_espera', orden_atencion: 0, id_reservacion: BigInt(1) },
        ]),
        updateMany: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      estudios: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      estudios_restricciones_edad: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      pacientes: {
        findUnique: jest.fn().mockResolvedValue({ id: 'patient-1', fecha_nacimiento: new Date('1990-01-01') }),
      },
      cola_atencion: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      estudios_secuencias: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      sucursales_consultorios: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, cantidad: 2 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckinService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AiService,
          useValue: { predictBatch: jest.fn().mockResolvedValue({ predicciones: [] }) },
        },
        {
          provide: SchedulingService,
          useValue: { registerArrivalAndReplan: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<CheckinService>(CheckinService);
  });

  describe('generatePass', () => {
    it('should generate a QR pass when reservation exists', async () => {
      prisma.reservaciones.findFirst.mockResolvedValue({
        id: BigInt(1),
        id_paciente: 'patient-1',
        id_sucursal: 46,
        reservaciones_servicios: [
          { id_estudio: 2, estado: 'en_espera' },
          { id_estudio: 10, estado: 'en_espera' },
        ],
      });

      const result = await service.generatePass({
        patientId: 'patient-1',
        branchId: 46,
        studyIds: [2, 10],
        prioridad: 'cita',
      });

      expect(result).toBeDefined();
      expect(result.token).toBeDefined();
      expect(result.patientId).toBe('patient-1');
      expect(result.branchId).toBe(46);
      expect(typeof result.token).toBe('string');
      expect(result.token.length).toBeGreaterThan(0);
    });

    it('should throw NotFoundException when no reservation exists', async () => {
      prisma.reservaciones.findFirst.mockResolvedValue(null);

      await expect(
        service.generatePass({
          patientId: 'patient-1',
          branchId: 46,
          studyIds: [2],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should generate unique tokens', async () => {
      prisma.reservaciones.findFirst.mockResolvedValue({
        id: BigInt(1),
        reservaciones_servicios: [{ id_estudio: 2 }],
      });

      const pass1 = await service.generatePass({
        patientId: 'p1', branchId: 46, studyIds: [2],
      });

      prisma.reservaciones.findFirst.mockResolvedValue({
        id: BigInt(2),
        reservaciones_servicios: [{ id_estudio: 2 }],
      });

      const pass2 = await service.generatePass({
        patientId: 'p2', branchId: 46, studyIds: [2],
      });

      expect(pass1.token).not.toBe(pass2.token);
    });
  });

  describe('redeemPass', () => {
    it('should redeem a valid pass', async () => {
      prisma.reservaciones.findFirst.mockResolvedValue({
        id: BigInt(1),
        reservaciones_servicios: [{ id_estudio: 2 }],
      });
      prisma.reservaciones.update.mockResolvedValue({});

      const pass = await service.generatePass({
        patientId: 'patient-1',
        branchId: 46,
        studyIds: [2],
      });

      const redeemed = await service.redeemPass(pass.token);
      expect(redeemed).not.toBeNull();
      expect(redeemed?.patientId).toBe('patient-1');
    });

    it('should return null for invalid token', async () => {
      const result = await service.redeemPass('nonexistent-token');
      expect(result).toBeNull();
    });

    it('should not allow double redemption', async () => {
      prisma.reservaciones.findFirst.mockResolvedValue({
        id: BigInt(1),
        reservaciones_servicios: [{ id_estudio: 2 }],
      });
      prisma.reservaciones.update.mockResolvedValue({});

      const pass = await service.generatePass({
        patientId: 'patient-1',
        branchId: 46,
        studyIds: [2],
      });

      await service.redeemPass(pass.token);
      const second = await service.redeemPass(pass.token);
      expect(second).toBeNull();
    });
  });

  describe('validateClinicalRules', () => {
    it('should validate studies that dont need medical order', async () => {
      prisma.estudios.findMany.mockResolvedValue([
        { id: 9, nombre: 'Electrocardiograma', requiere_orden_medica: false },
      ]);
      prisma.estudios_restricciones_edad.findMany.mockResolvedValue([]);

      const result = await service.validateClinicalRules({
        studyIds: [9],
        hasMedicalOrder: false,
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('ok');
    });

    it('should validate mastografia clinical rules', async () => {
      // Mastografia requires orden_medica for patients
      prisma.estudios.findMany.mockResolvedValue([
        { id: 3, nombre: 'Mastografia', requiere_orden_medica: true },
      ]);
      prisma.estudios_restricciones_edad.findMany.mockResolvedValue([]);

      const result = await service.validateClinicalRules({
        studyIds: [3],
        hasMedicalOrder: false,
      });

      expect(result).toBeDefined();
      // When estudio has requiere_orden_medica=true and patient has no order
      expect(result.status).toBe('requires_medical_order');
    });
  });
});
