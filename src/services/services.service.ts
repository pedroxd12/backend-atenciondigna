import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CategoriaDto {
  id: number;
  nombre: string;
  total: number;
}

export interface ServicioDto {
  id: number;
  idEstudio: number;
  categoria: string;
  nombre: string;
  precio: number | null;
  esPaquete: boolean;
  requierePreparacion: boolean;
  preparacion: string | null;
}

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async listarCategorias(): Promise<CategoriaDto[]> {
    const grupos = await this.prisma.servicios_salud_digna.groupBy({
      by: ['id_estudio'],
      where: { activo: true },
      _count: { _all: true },
    });

    const ids = grupos.map((g) => g.id_estudio);
    const estudios = await this.prisma.estudios.findMany({
      where: { id: { in: ids } },
      select: { id: true, nombre: true },
    });
    const nombreById = new Map(estudios.map((e) => [e.id, e.nombre]));

    return grupos
      .map((g) => ({
        id: g.id_estudio,
        nombre: nombreById.get(g.id_estudio) ?? `Categoria ${g.id_estudio}`,
        total: g._count._all,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  async listarServiciosPorCategoria(idEstudio: number): Promise<ServicioDto[]> {
    const items = await this.prisma.servicios_salud_digna.findMany({
      where: { id_estudio: idEstudio, activo: true },
      include: { estudios: { select: { nombre: true } } },
      orderBy: [{ es_paquete: 'desc' }, { nombre: 'asc' }],
    });

    return items.map((s) => ({
      id: s.id,
      idEstudio: s.id_estudio,
      categoria: s.estudios.nombre,
      nombre: s.nombre,
      precio: s.precio ? Number(s.precio) : null,
      esPaquete: s.es_paquete,
      requierePreparacion: s.requiere_preparacion,
      preparacion: s.preparacion_descripcion,
    }));
  }

  async obtenerServicio(id: number): Promise<ServicioDto | null> {
    const s = await this.prisma.servicios_salud_digna.findUnique({
      where: { id },
      include: { estudios: { select: { nombre: true } } },
    });
    if (!s) return null;
    return {
      id: s.id,
      idEstudio: s.id_estudio,
      categoria: s.estudios.nombre,
      nombre: s.nombre,
      precio: s.precio ? Number(s.precio) : null,
      esPaquete: s.es_paquete,
      requierePreparacion: s.requiere_preparacion,
      preparacion: s.preparacion_descripcion,
    };
  }
}
