import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, StaffAuthResponse } from './dto/auth.dto';

@Controller('staff')
export class StaffAuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginDto): Promise<StaffAuthResponse> {
    return this.auth.loginStaff(body.email, body.password);
  }
}
