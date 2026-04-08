import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { join } from "path";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  });

  app.useWebSocketAdapter(new IoAdapter(app));

  // Sirve la carpeta public/ en http://localhost:3000/
  app.useStaticAssets(join(__dirname, "..", "public"));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
