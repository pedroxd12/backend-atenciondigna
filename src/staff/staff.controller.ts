import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { LoginStaffDto } from './dto/login-staff.dto';

@Controller('staff')
export class StaffController {
	constructor(private readonly staffService: StaffService) {}

	/** Crear usuario staff */
	@Post()
	@HttpCode(HttpStatus.CREATED)
	crearStaff(@Body() dto: CreateStaffDto) {
		return this.staffService.crearStaff(dto);
	}

	/** Login simulado — devuelve nombre y clínica asignada */
	@Post('login')
	@HttpCode(HttpStatus.OK)
	login(@Body() dto: LoginStaffDto) {
		return this.staffService.login(dto);
	}
}
