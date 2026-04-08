import { Injectable } from '@nestjs/common';
import { PrismaService} from  '../prisma/prisma.service';

@Injectable()
export class SucursalesService {
    constructor(private prisma: PrismaService) {}

    // obtener todas las clinicas activas
    async findAll() {
        return this.prisma.sucursal.findMany({
            where: { activa: true },
            include: { 
                ciudad: {
                    include: { estado: true },
                }
            }
        });
    }

    // obtener una clinica especifica por su id
    async findOne(id: number) {
        return this.prisma.sucursal.findUnique({
            where: { id },
            include: {
                consultorios: true,
                staff: true
            }
        });
    }
}
