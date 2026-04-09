import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { pacientes: any; usuarios_staff: any };
  let jwt: JwtService;

  beforeEach(async () => {
    prisma = {
      pacientes: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      usuarios_staff: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('mock-jwt-token'), verifyAsync: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwt = module.get<JwtService>(JwtService);
  });

  describe('register', () => {
    it('should register a new patient', async () => {
      prisma.pacientes.findFirst.mockResolvedValue(null);
      prisma.pacientes.create.mockResolvedValue({
        id: 'uuid-1',
        email: 'test@mail.com',
        nombre: 'Juan',
        apellido_paterno: 'Perez',
      });

      const result = await service.register({
        email: 'test@mail.com',
        password: 'Test1234!',
        nombre: 'Juan',
        apellidoPaterno: 'Perez',
      });

      expect(result.token).toBe('mock-jwt-token');
      expect(result.patient.email).toBe('test@mail.com');
      expect(result.patient.fullName).toBe('Juan Perez');
    });

    it('should throw ConflictException for duplicate email', async () => {
      prisma.pacientes.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register({
          email: 'existing@mail.com',
          password: 'Test1234!',
          nombre: 'Juan',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should login with valid credentials', async () => {
      const hash = await bcrypt.hash('Test1234!', 10);
      prisma.pacientes.findFirst.mockResolvedValue({
        id: 'uuid-1',
        email: 'test@mail.com',
        nombre: 'Juan',
        apellido_paterno: 'Perez',
        password_hash: hash,
      });

      const result = await service.login({
        email: 'test@mail.com',
        password: 'Test1234!',
      });

      expect(result.token).toBe('mock-jwt-token');
      expect(result.patient.id).toBe('uuid-1');
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      const hash = await bcrypt.hash('Test1234!', 10);
      prisma.pacientes.findFirst.mockResolvedValue({
        id: 'uuid-1',
        password_hash: hash,
      });

      await expect(
        service.login({ email: 'test@mail.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      prisma.pacientes.findFirst.mockResolvedValue(null);

      await expect(
        service.login({ email: 'no@mail.com', password: 'any' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('googleSignIn', () => {
    it('should create new patient on first Google sign-in', async () => {
      prisma.pacientes.findFirst.mockResolvedValue(null);
      prisma.pacientes.create.mockResolvedValue({
        id: 'uuid-new',
        email: 'google@mail.com',
        nombre: 'Maria',
        apellido_paterno: 'Lopez',
      });

      const result = await service.googleSignIn({
        firebaseUid: 'firebase-123',
        email: 'google@mail.com',
        fullName: 'Maria Lopez',
      });

      expect(result.token).toBe('mock-jwt-token');
      expect(prisma.pacientes.create).toHaveBeenCalled();
    });

    it('should link firebase UID to existing patient', async () => {
      prisma.pacientes.findFirst.mockResolvedValue({
        id: 'uuid-existing',
        email: 'google@mail.com',
        nombre: 'Maria',
        apellido_paterno: 'Lopez',
        firebase_uid: null,
      });
      prisma.pacientes.update.mockResolvedValue({
        id: 'uuid-existing',
        email: 'google@mail.com',
        nombre: 'Maria',
        apellido_paterno: 'Lopez',
        firebase_uid: 'firebase-123',
      });

      const result = await service.googleSignIn({
        firebaseUid: 'firebase-123',
        email: 'google@mail.com',
        fullName: 'Maria Lopez',
      });

      expect(result.token).toBe('mock-jwt-token');
      expect(prisma.pacientes.update).toHaveBeenCalled();
    });
  });

  describe('loginStaff', () => {
    it('should login staff with demo password', async () => {
      prisma.usuarios_staff.findFirst.mockResolvedValue({
        id: 'staff-1',
        email: 'recepcion@test.com',
        nombre: 'Laura',
        apellido: 'Perez',
        rol: 'recepcionista',
        id_sucursal: 46,
        activo: true,
        sucursales: { id: 46, nombre: 'Coyoacan' },
      });

      const result = await service.loginStaff('recepcion@test.com', 'demo-staff-2026');

      expect(result.token).toBe('mock-jwt-token');
      expect(result.nombre).toBe('Laura');
      expect(result.rol).toBe('recepcionista');
    });

    it('should throw for non-existent staff', async () => {
      prisma.usuarios_staff.findFirst.mockResolvedValue(null);

      await expect(
        service.loginStaff('nobody@test.com', 'demo-staff-2026'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw for wrong staff password', async () => {
      prisma.usuarios_staff.findFirst.mockResolvedValue({
        id: 'staff-1',
        email: 'recepcion@test.com',
        activo: true,
        sucursales: { id: 46, nombre: 'Coyoacan' },
      });

      await expect(
        service.loginStaff('recepcion@test.com', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
