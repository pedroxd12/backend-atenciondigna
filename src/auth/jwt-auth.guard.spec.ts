import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: JwtService;

  beforeEach(() => {
    jwtService = {
      verifyAsync: jest.fn(),
    } as any;
    guard = new JwtAuthGuard(jwtService);
  });

  function mockContext(authHeader?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: authHeader ? { authorization: authHeader } : {},
        }),
      }),
    } as any;
  }

  it('should allow request with valid token', async () => {
    (jwtService.verifyAsync as jest.Mock).mockResolvedValue({ sub: 'user-1', email: 'test@mail.com' });

    const result = await guard.canActivate(mockContext('Bearer valid-token'));
    expect(result).toBe(true);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-token');
  });

  it('should reject request without Authorization header', async () => {
    await expect(guard.canActivate(mockContext())).rejects.toThrow(UnauthorizedException);
  });

  it('should reject request with non-Bearer token', async () => {
    await expect(guard.canActivate(mockContext('Basic abc123'))).rejects.toThrow(UnauthorizedException);
  });

  it('should reject request with expired token', async () => {
    (jwtService.verifyAsync as jest.Mock).mockRejectedValue(new Error('jwt expired'));

    await expect(guard.canActivate(mockContext('Bearer expired-token'))).rejects.toThrow(UnauthorizedException);
  });

  it('should attach payload to request.user', async () => {
    const payload = { sub: 'user-1', email: 'test@mail.com', rol: 'paciente' };
    (jwtService.verifyAsync as jest.Mock).mockResolvedValue(payload);

    const req: any = { headers: { authorization: 'Bearer valid-token' } };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as any;

    await guard.canActivate(ctx);
    expect(req.user).toEqual(payload);
  });
});
