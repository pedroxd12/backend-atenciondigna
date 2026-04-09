import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

/**
 * Guard JWT reutilizable. Extrae el token del header Authorization: Bearer <token>,
 * lo valida y adjunta el payload decodificado a request.user.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const token = this.extractToken(req);

    if (!token) {
      throw new UnauthorizedException('Token de autenticacion requerido');
    }

    try {
      const payload = await this.jwt.verifyAsync(token);
      // Adjuntamos el payload al request para que los controllers lo usen
      (req as any).user = payload;
    } catch {
      throw new UnauthorizedException('Token invalido o expirado');
    }

    return true;
  }

  private extractToken(req: Request): string | undefined {
    const auth = req.headers.authorization;
    if (!auth) return undefined;
    const [type, token] = auth.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
