import "dotenv/config";
import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app.module.js";
import { configureApi } from "./configure-api.js";
import { validateEnvironment } from "./environment.js";

async function bootstrap(): Promise<void> {
  validateEnvironment();

  const app = await NestFactory.create(AppModule);
  configureApi(app);
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.SWAGGER_ENABLED === "true"
  ) {
    const configuration = new DocumentBuilder()
      .setTitle("AllShops API")
      .setDescription("Phase 1 authentication, tenancy, branches, and RBAC")
      .setVersion("1.0")
      .addBearerAuth()
      .build();
    SwaggerModule.setup(
      "api/docs",
      app,
      SwaggerModule.createDocument(app, configuration),
    );
  }
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
  const server = app.getHttpServer() as {
    requestTimeout: number;
    headersTimeout: number;
    keepAliveTimeout: number;
  };
  server.requestTimeout = Number(process.env.REQUEST_TIMEOUT_MS ?? 30_000);
  server.headersTimeout = server.requestTimeout + 5_000;
  server.keepAliveTimeout = 5_000;

  Logger.log(`API listening on port ${port}`, "Bootstrap");
}

void bootstrap();
