import "reflect-metadata";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { NestFactory, Reflector } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/http-exception.filter";
import { SupabaseAuthGuard } from "./common/guards/supabase-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { ConfigService } from "@nestjs/config";
import { SupabaseService } from "./supabase/supabase.service";
import { PinoJsonLogger } from "./common/logger/pino-json.logger";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";

async function bootstrap() {
  console.log("🚀 [Bootstrap] Starting ARShop API initialization...");
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  const logger = new Logger("Bootstrap");
  app.useLogger(new PinoJsonLogger());

  // Detrás de Vercel/Render el request viene del edge: sin `trust proxy`,
  // `req.ip` siempre apunta al balanceador y el ThrottlerModule termina
  // throttleando globalmente a todos los usuarios. `1` = un solo hop (edge).
  app.set("trust proxy", 1);

  // Seguridad y parsing
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(","),
    credentials: true,
  });

  // Validación global de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Filtros + interceptores globales
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Guards globales — Auth primero, Roles después
  const reflector = app.get(Reflector);
  const supabase = app.get(SupabaseService);
  const config = app.get(ConfigService);
  app.useGlobalGuards(
    new SupabaseAuthGuard(reflector, supabase, config),
    new RolesGuard(reflector),
  );

  // OpenAPI / Swagger — expuesto en no-producción para que front/QA/postman
  // vean el contrato sin que un bot lo scrape en prod. Si quieres habilitarlo
  // en prod también, cambia la condición y protege la ruta con basic auth.
  if (process.env.NODE_ENV !== "production") {
    const config = new DocumentBuilder()
      .setTitle("ARShop API")
      .setDescription("API de ARShop: catálogo, órdenes, pagos, delivery, admin.")
      .setVersion("0.1.0")
      .addCookieAuth("arshop_access_token", {
        type: "apiKey",
        in: "cookie",
        name: "arshop_access_token",
      })
      .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" })
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("docs", app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    logger.log(`Swagger docs: http://localhost:${process.env.PORT ?? 4000}/docs`);
  }

  const port = Number(process.env.PORT ?? 4000);
  console.log(`🚀 [Bootstrap] Binding to 0.0.0.0:${port}...`);
  await app.listen(port, "0.0.0.0");
  console.log(`✅ [Bootstrap] ARShop API is LIVE and listening on http://0.0.0.0:${port}`);
  logger.log(`ARShop API listening on http://0.0.0.0:${port}`);
}

bootstrap().catch((err) => {
  console.error("Fatal bootstrap error", err);
  process.exit(1);
});
