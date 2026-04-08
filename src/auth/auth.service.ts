import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuthResponse,
  GoogleSignInDto,
  LoginDto,
  RegisterDto,
} from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // ────────────────────────────────────────────────
  // Registro con email + contrasena
  // ────────────────────────────────────────────────
  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.prisma.pacientes.findFirst({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con ese correo');
    }

    const hash = await bcrypt.hash(dto.password, 10);
    const paciente = await this.prisma.pacientes.create({
      data: {
        email: dto.email,
        nombre: dto.nombre,
        apellido_paterno: dto.apellidoPaterno ?? null,
        apellido_materno: dto.apellidoMaterno ?? null,
        telefono: dto.telefono ?? null,
        fecha_nacimiento: dto.fechaNacimiento
          ? new Date(dto.fechaNacimiento)
          : null,
        sexo: dto.sexo ?? null,
        password_hash: hash,
      },
    });

    return this.buildResponse(paciente);
  }

  // ────────────────────────────────────────────────
  // Login con email + contrasena
  // ────────────────────────────────────────────────
  async login(dto: LoginDto): Promise<AuthResponse> {
    const paciente = await this.prisma.pacientes.findFirst({
      where: { email: dto.email },
    });
    if (!paciente?.password_hash) {
      throw new UnauthorizedException('Credenciales invalidas');
    }
    const ok = await bcrypt.compare(dto.password, paciente.password_hash);
    if (!ok) throw new UnauthorizedException('Credenciales invalidas');

    return this.buildResponse(paciente);
  }

  // ────────────────────────────────────────────────
  // Google sign-in (Firebase Auth en el cliente)
  // ────────────────────────────────────────────────
  async googleSignIn(dto: GoogleSignInDto): Promise<AuthResponse> {
    let paciente = await this.prisma.pacientes.findFirst({
      where: {
        OR: [{ firebase_uid: dto.firebaseUid }, { email: dto.email }],
      },
    });

    if (!paciente) {
      const [nombre, ...rest] = dto.fullName.split(' ');
      paciente = await this.prisma.pacientes.create({
        data: {
          firebase_uid: dto.firebaseUid,
          email: dto.email,
          nombre: nombre || 'Paciente',
          apellido_paterno: rest.join(' ') || null,
        },
      });
    } else if (!paciente.firebase_uid) {
      paciente = await this.prisma.pacientes.update({
        where: { id: paciente.id },
        data: { firebase_uid: dto.firebaseUid },
      });
    }

    return this.buildResponse(paciente);
  }

  // ────────────────────────────────────────────────
  private buildResponse(paciente: {
    id: string;
    email: string | null;
    nombre: string;
    apellido_paterno: string | null;
  }): AuthResponse {
    const token = this.jwt.sign({
      sub: paciente.id,
      email: paciente.email,
    });
    return {
      token,
      patient: {
        id: paciente.id,
        email: paciente.email ?? '',
        fullName: [paciente.nombre, paciente.apellido_paterno]
          .filter(Boolean)
          .join(' '),
        photoUrl: null,
      },
    };
  }
}
