export class RegisterDto {
  email!: string;
  password!: string;
  nombre!: string;
  apellidoPaterno?: string;
  apellidoMaterno?: string;
  telefono?: string;
  fechaNacimiento?: string; // YYYY-MM-DD
  sexo?: string; // M | F | O
}

export class LoginDto {
  email!: string;
  password!: string;
}

export class GoogleSignInDto {
  /** Firebase ID token devuelto por GoogleSignIn en el cliente. */
  firebaseUid!: string;
  email!: string;
  fullName!: string;
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
