import { Injectable, Logger } from "@nestjs/common";
import { QrService } from "./qr/qr.service";
import type { CreatePacienteDto } from "./dto/create-paciente.dto";
import type { CreateReservacionDto } from "./dto/create-reservacion.dto";
import type { ReservacionQrResponseDto } from "./dto/reservacion-qr-response.dto";

// ── Datos mock fijos ──────────────────────────────────────────────────────────
const MOCK_DIRECCION =
  "Av. Universidad #1338 (Entre Madrid y Cto. Interior Río Churubusco), C.P. 04100, Alcaldía Coyoácan, CDMX";
const MOCK_TELEFONO = "5555547166";
const MOCK_SUCURSAL = "Sucursal Centro CDMX";

// Contador en memoria para folios de reservación
let folioCounter = 1000;

@Injectable()
export class CitasService {
  private readonly logger = new Logger(CitasService.name);

  constructor(private readonly qrService: QrService) {}



  async registrarPaciente(dto: CreatePacienteDto) {
    const id = crypto.randomUUID();
    this.logger.log(`[MOCK] Paciente registrado con id=${id}`);
    return {
      id,
      firebase_uid: dto.firebase_uid ?? null,
      nombre: dto.nombre,
      apellido_paterno: dto.apellido_paterno ?? null,
      apellido_materno: dto.apellido_materno ?? null,
      fecha_nacimiento: dto.fecha_nacimiento ?? null,
      sexo: dto.sexo ?? null,
      email: dto.email ?? null,
      telefono: dto.telefono ?? null,
      latitud_habitual: dto.latitud_habitual ?? null,
      longitud_habitual: dto.longitud_habitual ?? null,
      created_at: new Date().toISOString(),
    };
  }


  async crearReservacion(dto: CreateReservacionDto) {
    const folio = ++folioCounter;
    this.logger.log(`[MOCK] Reservación creada folio=${folio}`);
    return {
      id: folio,
      id_paciente: dto.id_paciente,
      id_sucursal: dto.id_sucursal,
      fecha_programada: dto.fecha_programada,
      hora_programada: dto.hora_programada ?? null,
      origen: dto.origen ?? "app",
      estado: "pendiente",
      notas: dto.notas ?? null,
      created_at: new Date().toISOString(),
      servicios: dto.servicios.map((srv, idx) => ({
        id_estudio: srv.id_estudio,
        id_subestudio: srv.id_subestudio ?? null,
        estado: "en_espera",
        orden_atencion: idx + 1,
      })),
    };
  }


  async getReservacionQrView(id: bigint): Promise<ReservacionQrResponseDto> {
    this.logger.log(`[MOCK] Generando QR para folio=${id}`);

    const folio = id.toString();
    const nombreCompleto = "Paciente Demo";
    const fecha = new Date().toISOString().split("T")[0];

    const servicios = [
      {
        id: 1,
        estudio: "Análisis de Sangre",
        subestudio: null,
        consultorio: "Consultorio A",
        estado: "en_espera",
        orden_atencion: 1,
      },
    ];

    const qrDataUrl = await this.qrService.generateReservacionQr({
      folio,
      paciente: nombreCompleto,
      sucursal: MOCK_SUCURSAL,
      fecha,
      estudios: servicios.map((s) => s.estudio),
    });

    return {
      folio,
      estado: "pendiente",
      fecha_programada: fecha,
      hora_programada: "10:00",
      origen: "app",
      paciente: {
        nombre_completo: nombreCompleto,
        email: "demo@example.com",
        telefono: MOCK_TELEFONO,
      },
      sucursal: {
        nombre: MOCK_SUCURSAL,
        direccion: MOCK_DIRECCION,
        telefono: MOCK_TELEFONO,
        hora_apertura: "08:00",
        hora_cierre: "18:00",
      },
      servicios,
      qr_data_url: qrDataUrl,
    };
  }
}
