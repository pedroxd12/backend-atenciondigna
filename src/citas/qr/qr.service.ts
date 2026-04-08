import { Injectable, Logger } from "@nestjs/common";
import * as QRCode from "qrcode";

export interface QrPayload {
  folio: string;
  paciente: string;
  sucursal: string;
  fecha: string;
  estudios: string[];
}

@Injectable()
export class QrService {
  private readonly logger = new Logger(QrService.name);

  async generateReservacionQr(payload: QrPayload): Promise<string> {
    const content = JSON.stringify({
      folio: payload.folio,
      paciente: payload.paciente,
      sucursal: payload.sucursal,
      fecha: payload.fecha,
      estudios: payload.estudios,
    });

    try {
      const dataUrl = await QRCode.toDataURL(content, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 300,
        color: {
          dark: "#1a1a2e",
          light: "#ffffff",
        },
      });
      return dataUrl;
    } catch (err) {
      this.logger.error("Error generando QR", err);
      throw err;
    }
  }
}
