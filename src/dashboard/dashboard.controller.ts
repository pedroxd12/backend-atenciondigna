import { Controller, Get, Param, Query, HttpCode, HttpStatus, ParseIntPipe } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
	constructor(private readonly dashboardService: DashboardService) {}

	@Get('reservaciones/recientes')
	@HttpCode(HttpStatus.OK)
	getReservacionesRecientes(@Query('idSucursal') idSucursal?: string) {
		const parsed = idSucursal ? parseInt(idSucursal, 10) : undefined;
		return this.dashboardService.getReservacionesRecientes(
			parsed && !isNaN(parsed) ? parsed : undefined,
		);
	}

	/** Todos los pacientes con cita hoy (sin filtro de servicio) */
	@Get('cola')
	@HttpCode(HttpStatus.OK)
	getColaPacientes(@Query('idSucursal') idSucursal?: string) {
		const parsed = idSucursal ? parseInt(idSucursal, 10) : undefined;
		return this.dashboardService.getColaPacientes(
			parsed && !isNaN(parsed) ? parsed : undefined,
		);
	}

	/** Pacientes cuya cita incluye el estudio :id_estudio */
	@Get('cola/servicio/:id_estudio')
	@HttpCode(HttpStatus.OK)
	getColaPorServicio(
		@Param('id_estudio', ParseIntPipe) id_estudio: number,
		@Query('idSucursal') idSucursal?: string,
	) {
		const parsed = idSucursal ? parseInt(idSucursal, 10) : undefined;
		return this.dashboardService.getColaPorServicio(
			id_estudio,
			parsed && !isNaN(parsed) ? parsed : undefined,
		);
	}
}
