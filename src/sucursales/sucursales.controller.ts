import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { SucursalesService } from './sucursales.service';

@Controller('sucursales')
export class SucursalesController {
    constructor(private readonly sucursalesService: SucursalesService) {
    }

    // This handles: GET /sucursales
    @Get()
    async findAll() {
        return this.sucursalesService.findAll();
    }

    // This handles: GET 
    @Get()
    async findOne(@Param('id', ParseIntPipe) id: number){
        return this.sucursalesService.findOne(id);
    }
}
