import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { StaffAuthController } from './staff-auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'atencion-digna-dev-secret',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController, StaffAuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
