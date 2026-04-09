import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ServicesService } from './services.service';

/**
 * Catalogo publico de servicios de Salud Digna (cargado desde el Excel oficial).
 */
@Controller('servicios')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get('categorias')
  listarCategorias() {
    return this.services.listarCategorias();
  }

  /** Catalogo completo: 12 categorias + variantes + tiempos vivos del modelo IA. */
  @Get('catalogo-completo')
  catalogoCompleto() {
    return this.services.catalogoCompleto();
  }

  @Get('categoria/:idEstudio')
  listarPorCategoria(@Param('idEstudio', ParseIntPipe) idEstudio: number) {
    return this.services.listarServiciosPorCategoria(idEstudio);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.services.obtenerServicio(id);
  }
}
