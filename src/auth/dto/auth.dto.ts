import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/, {
    message:
      'La contrasena debe incluir mayuscula, minuscula, numero y simbolo',
  })
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  apellidoPaterno?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  apellidoMaterno?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string;

  @IsOptional()
  @IsString()
  fechaNacimiento?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  sexo?: string; // M | F | O
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

export class GoogleSignInDto {
  /** Firebase ID token devuelto por GoogleSignIn en el cliente. */
  @IsString()
  firebaseUid!: string;

  @IsEmail()
  email!: string;

  @IsString()
  fullName!: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;
}

export interface AuthResponse {
  token: string;
  patient: {
    id: string;
    email: string;
    fullName: string;
    photoUrl?: string | null;
  };
}

export interface StaffAuthResponse {
  token: string;
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  rol: string;
  id_estudio_asignado: number | null;
  estudio?: { id: number | null; nombre: string };
  sucursal: { id: number; nombre: string };
}
