export class ServicioReservacionDto {
  /** ID del estudio a reservar */
  declare id_estudio: number;

  /** ID del subestudio (opcional) */
  id_subestudio?: number;
}

export class CreateReservacionDto {
  /** UUID del paciente */
  declare id_paciente: string;

  /** ID de la sucursal */
  declare id_sucursal: number;

  /** Fecha programada ISO 8601 (YYYY-MM-DD) */
  declare fecha_programada: string;

  /** Hora programada HH:MM (24h), opcional para walk-in */
  hora_programada?: string;

  /** Canal de origen: 'app', 'recepcion', 'web' */
  origen?: string;

  /** Notas adicionales */
  notas?: string;

  /** Lista de estudios a reservar (mínimo 1) */
  declare servicios: ServicioReservacionDto[];
}
