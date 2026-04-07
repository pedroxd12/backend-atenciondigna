export class ResponseEventDto {
  /** Identificador de la consulta / caso al que pertenece la respuesta */
  declare caseId: string;

  /** Tipo de respuesta (e.g. 'answer', 'status', 'error') */
  declare type: string;

  /** Payload libre enviado por el microservicio FastAPI */
  declare content: Record<string, unknown>;

  /** ISO timestamp generado por FastAPI */
  timestamp?: string;
}
