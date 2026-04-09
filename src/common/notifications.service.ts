import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Servicio de notificaciones push via Firebase Cloud Messaging.
 *
 * Usa el campo `firebase_uid` de la tabla `pacientes` como token FCM.
 * Para produccion: almacenar tokens FCM en una tabla separada y usar
 * firebase-admin SDK. Para el MVP/hackathon usamos fetch directo a la
 * FCM HTTP v1 API.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private fcmEnabled = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const key = process.env.FIREBASE_SERVER_KEY;
    if (key) {
      this.fcmEnabled = true;
      this.logger.log('Firebase push notifications habilitadas');
    } else {
      this.logger.warn(
        'FIREBASE_SERVER_KEY no configurada — push notifications deshabilitadas',
      );
    }
  }

  /**
   * Notifica al paciente que es su turno.
   */
  async notifyTurnReady(patientId: string, area: string): Promise<void> {
    if (!this.fcmEnabled) return;

    const paciente = await this.prisma.pacientes.findUnique({
      where: { id: patientId },
    });

    const token = paciente?.firebase_uid;
    if (!token) {
      this.logger.debug(`Paciente ${patientId} sin token FCM, skip push`);
      return;
    }

    try {
      await this.sendPush(token, {
        title: '¡Es tu turno!',
        body: `Dirígete a ${area}`,
      });
      this.logger.log(`Push enviado a paciente ${patientId} → ${area}`);
    } catch (e) {
      this.logger.warn(`Error enviando push: ${(e as Error).message}`);
    }
  }

  /**
   * Notifica al paciente sobre un cambio en su tiempo de espera.
   */
  async notifyDelayChange(
    patientId: string,
    newEstimateMin: number,
  ): Promise<void> {
    if (!this.fcmEnabled) return;

    const paciente = await this.prisma.pacientes.findUnique({
      where: { id: patientId },
    });

    const token = paciente?.firebase_uid;
    if (!token) return;

    try {
      await this.sendPush(token, {
        title: 'Actualización de espera',
        body: `Tu tiempo estimado cambió a ~${Math.round(newEstimateMin)} min`,
      });
    } catch (e) {
      this.logger.warn(`Error enviando push delay: ${(e as Error).message}`);
    }
  }

  private async sendPush(
    fcmToken: string,
    notification: { title: string; body: string },
  ): Promise<void> {
    const serverKey = process.env.FIREBASE_SERVER_KEY;
    if (!serverKey) return;

    const res = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `key=${serverKey}`,
      },
      body: JSON.stringify({
        to: fcmToken,
        notification,
        data: notification,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`FCM ${res.status}: ${body}`);
    }
  }
}
