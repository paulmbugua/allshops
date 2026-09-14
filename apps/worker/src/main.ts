import "dotenv/config";
import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { validateWorkerEnvironment } from "./environment.js";
import { WorkerModule } from "./worker.module.js";

async function bootstrap(): Promise<void> {
  validateWorkerEnvironment();

  const application = await NestFactory.createApplicationContext(WorkerModule);
  application.enableShutdownHooks();
  Logger.log("AllShops worker started", "Bootstrap");
}

void bootstrap();
