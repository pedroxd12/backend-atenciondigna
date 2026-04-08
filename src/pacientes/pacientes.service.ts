import { Injectable } from '@nestjs/common';
import { PrismaService} from '../prisma/prisma.service'

@Injectable()
export class PacientesService {
    constructor(private prisma: PrismaService) {}

    async syncPatient(firebaseUid: string, patientData: { nombre: string, email: string} ) {
        return this.prisma.paciente.upsert({
            where: {
                firebase_uid: firebaseUid
            },
            update: {
                email: patientData.email,
            },
            create: {
                firebase_uid: firebaseUid,
                nombre: patientData.nombre,
                email: patientData.email,
            },
        });
    }

    async getProfile(id: string) {
        return this.prisma.paciente.findUnique({
            where: { id },
            include: {
                //incluir reservaciones aquí
            }
        });
    }
}

