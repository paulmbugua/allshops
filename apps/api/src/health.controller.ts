import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";

import { HealthService } from "./health.service.js";
import { Public } from "./public.decorator.js";

@Public()
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  health() {
    return {
      status: "ok",
      service: "allshops-api",
      version: process.env.APP_VERSION ?? "0.0.0",
    } as const;
  }

  @Get("live")
  liveness() {
    return this.health();
  }

  @Get("ready")
  async readiness() {
    const checks = await this.healthService.readiness();
    const ready = checks.postgres === "up";
    const degraded = ready && checks.redis === "down";
    const response = {
      status: ready ? (degraded ? "degraded" : "ok") : "unavailable",
      service: "allshops-api",
      checks,
    } as const;

    if (!ready) {
      throw new ServiceUnavailableException(response);
    }

    return response;
  }
}
