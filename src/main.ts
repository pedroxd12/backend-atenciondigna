import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

// Prisma devuelve bigint nativo para columnas BIGINT (encuestas.id, etc.)
// JSON.stringify no soporta bigint por default. Lo serializamos como string.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS abierto para el MVP — en produccion restringir al dominio del
  // frontend (app movil + dashboard).
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') ?? '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Railway / Docker: SIEMPRE bindear a 0.0.0.0 sino el healthcheck externo
  // no llega al contenedor (por default Nest escucha solo en localhost).
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');

  console.log(`Backend NestJS escuchando en 0.0.0.0:${port}`);
}
bootstrap();
