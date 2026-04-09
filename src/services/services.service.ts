import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

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

/**
 * Item del catalogo completo: categoria con todas sus variantes y los
 * tiempos REALES (servicio + espera) calculados por el modelo de IA en
 * la sucursal MVP (Coyoacan, id 46).
 */
export interface CatalogoCategoriaDto {
  idEstudio: number;
  nombre: string;
  icono: string;
  descripcion: string;
  preparacion: string;
  /** Tiempo de atencion (consultorio efectivo) — viene de la BD. */
  tiempoServicioMin: number;
  /** Tiempo promedio de espera historico — viene de la BD. */
  tiempoEsperaPromedioMin: number;
  /** Espera promedio + atencion = experiencia total estimada (historico). */
  tiempoTotalPromedioMin: number;
  /** Tiempo de espera vivo del modelo IA. Null si el modelo no respondio. */
  tiempoEsperaActualMin: number | null;
  /** Espera vivo + atencion = experiencia total VIVA. Null si no hay vivo. */
  tiempoTotalActualMin: number | null;
  /** Nivel de saturacion en vivo del modelo IA. Null si no respondio. */
  saturacionActual: 'bajo' | 'medio' | 'alto' | 'critico' | null;
  items: ServicioDto[];
}

const SUCURSAL_MVP_ID = 46;

@Injectable()
export class ServicesService {
  private readonly logger = new Logger(ServicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

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

  /**
   * Devuelve el catalogo completo de Salud Digna para la sucursal MVP
   * (Coyoacan, id 46) con UNA sola consulta:
   *   - Estudios activos (categorias) ordenados.
   *   - Para cada categoria: lista completa de variantes (paquetes/precios).
   *   - Iconos / preparacion / descripcion para la UI.
   *   - Tiempo de servicio + tiempo de espera HISTORICO de la BD.
   *   - Tiempo de espera ACTUAL en vivo, calculado por el modelo de IA
   *     a traves del scheduler (`/scheduler/clinic/46/snapshot`).
   *   - Nivel de saturacion en vivo (bajo/medio/alto/critico).
   *
   * Si el microservicio IA no responde, los campos en vivo quedan null
   * y el cliente cae al promedio historico.
   */
  async catalogoCompleto(): Promise<CatalogoCategoriaDto[]> {
    // 1. Categorias activas con sus tiempos por estudio.
    const estudios = await this.prisma.estudios.findMany({
      where: { activo: true },
      orderBy: { orden_prioridad: 'asc' },
    });

    // 2. Todos los servicios en una sola consulta + categoria nombre.
    const servicios = await this.prisma.servicios_salud_digna.findMany({
      where: { activo: true },
      include: { estudios: { select: { nombre: true } } },
      orderBy: [{ es_paquete: 'desc' }, { nombre: 'asc' }],
    });

    const itemsByEstudio = new Map<number, ServicioDto[]>();
    for (const s of servicios) {
      const dto: ServicioDto = {
        id: s.id,
        idEstudio: s.id_estudio,
        categoria: s.estudios.nombre,
        nombre: s.nombre,
        precio: s.precio ? Number(s.precio) : null,
        esPaquete: s.es_paquete,
        requierePreparacion: s.requiere_preparacion,
        preparacion: s.preparacion_descripcion,
      };
      const arr = itemsByEstudio.get(s.id_estudio) ?? [];
      arr.push(dto);
      itemsByEstudio.set(s.id_estudio, arr);
    }

    // 3. Snapshot vivo del scheduler para tiempos reales por sala.
    let snapshotByEstudio = new Map<
      number,
      { tiempoEsperaActualMin: number; nivel: string }
    >();
    try {
      const snap = await this.ai.clinicSnapshot(SUCURSAL_MVP_ID);
      snapshotByEstudio = new Map(
        snap.salas.map((s) => [
          s.id_estudio,
          {
            tiempoEsperaActualMin: s.tiempo_espera_estimado_min,
            nivel: s.nivel_saturacion,
          },
        ]),
      );
    } catch (e) {
      // No spammeamos el log: solo verbose en debug.
      this.logger.debug(
        `IA no disponible para snapshot de sucursal ${SUCURSAL_MVP_ID}: ${
          e instanceof Error ? e.message : String(e)
        } — fallback a tiempos historicos.`,
      );
    }

    // 4. Compone la respuesta final, manteniendo solo las categorias que
    //    tengan al menos un servicio cargado.
    const out: CatalogoCategoriaDto[] = [];
    for (const e of estudios) {
      const items = itemsByEstudio.get(e.id) ?? [];
      if (items.length === 0) continue;
      const live = snapshotByEstudio.get(e.id);
      const atencion = e.tiempo_atencion_promedio_min ?? 15;
      const esperaProm = e.tiempo_espera_promedio_min;
      const esperaActual = live?.tiempoEsperaActualMin ?? null;
      out.push({
        idEstudio: e.id,
        nombre: e.nombre,
        icono: this.iconForEstudio(e.nombre),
        descripcion: this.descripcionFor(e.nombre),
        preparacion: this.preparacionFor(e.nombre),
        tiempoServicioMin: atencion,
        tiempoEsperaPromedioMin: esperaProm,
        tiempoTotalPromedioMin: esperaProm + atencion,
        tiempoEsperaActualMin: esperaActual,
        tiempoTotalActualMin:
          esperaActual !== null ? Math.round(esperaActual + atencion) : null,
        saturacionActual:
          (live?.nivel as CatalogoCategoriaDto['saturacionActual']) ?? null,
        items,
      });
    }
    return out;
  }

  // ──────────────────────────────────────────────
  // Iconos / textos auxiliares para la UI
  // (en el frontend antes estaban hardcodeados; ahora salen del backend)
  // ──────────────────────────────────────────────
  private iconForEstudio(nombre: string): string {
    const n = nombre.toUpperCase();
    if (n.includes('LABORATORIO')) return 'science';
    if (n.includes('PAPANICOLAOU')) return 'female';
    if (n.includes('RAYOS')) return 'medical_information';
    if (n.includes('ULTRASONIDO')) return 'pregnant_woman';
    if (n.includes('ELECTROCARDIOGRAMA')) return 'monitor_heart';
    if (n.includes('TOMOGRAFIA') || n.includes('TOMOGRAFÍA')) return 'biotech';
    if (n.includes('RESONANCIA')) return 'auto_graph';
    if (n.includes('NUTRICION') || n.includes('NUTRICIÓN')) return 'restaurant';
    if (n.includes('MASTOGRAFIA') || n.includes('MASTOGRAFÍA'))
      return 'favorite_border';
    if (n.includes('DENSITOMETRIA') || n.includes('DENSITOMETRÍA'))
      return 'accessibility_new';
    if (n.includes('OPTICA') || n.includes('ÓPTICA')) return 'visibility';
    return 'medical_services';
  }

  private descripcionFor(nombre: string): string {
    const n = nombre.toUpperCase();
    if (n.includes('LABORATORIO'))
      return 'Toma de muestra rapida. Resultados disponibles el mismo dia o al siguiente.';
    if (n.includes('PAPANICOLAOU'))
      return 'Estudio breve. Procura programarlo entre el dia 10 y 20 de tu ciclo.';
    if (n.includes('RAYOS')) return 'Estudio rapido (5-10 min). Sin dolor.';
    if (n.includes('ULTRASONIDO')) return 'Estudio sin radiacion. Indoloro.';
    if (n.includes('ELECTROCARDIOGRAMA'))
      return 'Procedimiento de 5 min, no invasivo.';
    if (n.includes('TOMOGRAFIA') || n.includes('TOMOGRAFÍA'))
      return 'Dura entre 10 y 30 min. Procedimiento muy seguro.';
    if (n.includes('RESONANCIA'))
      return 'Examen detallado, dura 20-45 min. Permanece quieto.';
    if (n.includes('NUTRICION') || n.includes('NUTRICIÓN'))
      return 'Plan personalizado segun tus objetivos.';
    if (n.includes('MASTOGRAFIA') || n.includes('MASTOGRAFÍA'))
      return 'Estudio breve. Compresion de mama por unos segundos.';
    if (n.includes('DENSITOMETRIA') || n.includes('DENSITOMETRÍA'))
      return 'Estudio rapido (5-10 min). Mide la densidad de tus huesos.';
    if (n.includes('OPTICA') || n.includes('ÓPTICA'))
      return 'Examen visual completo en 15-20 min.';
    return 'Consulta de aproximadamente 15 min.';
  }

  private preparacionFor(nombre: string): string {
    const n = nombre.toUpperCase();
    if (n.includes('LABORATORIO'))
      return 'Ayuno de 8 a 12 horas. Puedes tomar agua. Si traes muestra de orina, no debe tener mas de 2 horas de recolectada.';
    if (n.includes('PAPANICOLAOU'))
      return 'No usar cremas, ovulos ni duchas vaginales 48 h antes. No debes estar menstruando.';
    if (n.includes('RAYOS'))
      return 'Usar ropa comoda sin objetos metalicos. Si es columna o abdomen, ven en ayuno de 6 h.';
    if (n.includes('ULTRASONIDO'))
      return 'Para abdominal: ayuno de 6 h. Para pelvico: vejiga llena (toma 1 L de agua 1 h antes).';
    if (n.includes('ELECTROCARDIOGRAMA'))
      return 'No requiere preparacion. Evita cafeina 4 h antes. Trae ropa comoda.';
    if (n.includes('TOMOGRAFIA') || n.includes('TOMOGRAFÍA'))
      return 'Ayuno de 4 h. Si es contrastada, hidratacion previa y revisar funcion renal. Llega 30 min antes.';
    if (n.includes('RESONANCIA'))
      return 'Sin objetos metalicos. Avisanos si tienes implantes, marcapasos o claustrofobia. Ayuno de 4 h.';
    if (n.includes('NUTRICION') || n.includes('NUTRICIÓN'))
      return 'Ven con ropa ligera. Evita comidas pesadas 2 h antes. Trae tus estudios recientes si los tienes.';
    if (n.includes('MASTOGRAFIA') || n.includes('MASTOGRAFÍA'))
      return 'No uses desodorante, talco ni cremas en pecho ni axilas el dia del estudio. Si tienes menos de 35 anos requiere orden medica.';
    if (n.includes('DENSITOMETRIA') || n.includes('DENSITOMETRÍA'))
      return 'No uses ropa con metales (cierres, broches). Sin cremas en piel.';
    if (n.includes('OPTICA') || n.includes('ÓPTICA'))
      return 'Si usas lentes, traelos. Evita usar lentes de contacto 24 h antes del examen.';
    return 'No requiere preparacion especial. Trae tus estudios y medicamentos actuales.';
  }
}
