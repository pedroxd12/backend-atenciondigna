import { Controller, Get, Param, HttpCode, HttpStatus, ParseIntPipe } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
	constructor(private readonly dashboardService: DashboardService) {}

	@Get('reservaciones/recientes')
	@HttpCode(HttpStatus.OK)
	getReservacionesRecientes() {
		return this.dashboardService.getReservacionesRecientes();
	}

	/** Todos los pacientes con cita hoy (sin filtro de servicio) */
	@Get('cola')
	@HttpCode(HttpStatus.OK)
	getColaPacientes() {
		return this.dashboardService.getColaPacientes();
	}

	/** Pacientes cuya cita incluye el estudio :id_estudio */
	@Get('cola/servicio/:id_estudio')
	@HttpCode(HttpStatus.OK)
	getColaPorServicio(@Param('id_estudio', ParseIntPipe) id_estudio: number) {
		return this.dashboardService.getColaPorServicio(id_estudio);
	}
}
