import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      pacientes: { findUnique: jest.fn() },
      sucursales: { findUnique: jest.fn() },
      reservaciones: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
  });

  describe('create', () => {
    it('should create an appointment with valid data', async () => {
      prisma.pacientes.findUnique.mockResolvedValue({ id: 'patient-1' });
      prisma.sucursales.findUnique.mockResolvedValue({ id: 46, nombre: 'Coyoacan' });
      prisma.reservaciones.create.mockResolvedValue({
        id: BigInt(1),
        id_paciente: 'patient-1',
        id_sucursal: 46,
        fecha_programada: new Date('2026-04-09'),
        hora_programada: new Date('1970-01-01T09:00:00Z'),
        estado: 'pendiente',
        reservaciones_servicios: [
          { id_estudio: 2 },
          { id_estudio: 10 },
        ],
      });

      const result = await service.create({
        patientId: 'patient-1',
        branchId: 46,
        date: '2026-04-09',
        time: '09:00',
        studyIds: [2, 10],
      });

      expect(result.branchId).toBe(46);
      expect(result.studyIds).toEqual([2, 10]);
      expect(result.status).toBe('pendiente');
    });

    it('should throw NotFoundException for missing patient', async () => {
      prisma.pacientes.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          patientId: 'nonexistent',
          branchId: 46,
          date: '2026-04-09',
          studyIds: [2],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for empty studyIds', async () => {
      await expect(
        service.create({
          patientId: 'patient-1',
          branchId: 46,
          date: '2026-04-09',
          studyIds: [],
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listForPatient', () => {
    it('should return formatted appointments', async () => {
      prisma.reservaciones.findMany.mockResolvedValue([
        {
          id: BigInt(1),
          id_sucursal: 46,
          fecha_programada: new Date('2026-04-09'),
          hora_programada: new Date('1970-01-01T09:00:00Z'),
          estado: 'pendiente',
          sucursales: { nombre: 'Coyoacan' },
          reservaciones_servicios: [
            { id_estudio: 2, estudios: { nombre: 'Laboratorio' } },
          ],
        },
      ]);

      const result = await service.listForPatient('patient-1');

      expect(result).toHaveLength(1);
      expect(result[0].branchName).toBe('Coyoacan');
      expect(result[0].studies[0].name).toBe('Laboratorio');
    });
  });
});
