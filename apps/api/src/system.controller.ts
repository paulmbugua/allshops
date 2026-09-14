import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { Public } from "./public.decorator.js";
import { prometheusMetrics } from "./observability.js";
import type { ResponseContext } from "./security.types.js";

@Public()
@Controller()
export class SystemController {
  @Get("version")
  version() {
    return {
      version: process.env.APP_VERSION ?? "0.0.0",
      gitSha: process.env.GIT_SHA ?? "development",
      buildTime: process.env.BUILD_TIME ?? "development",
    };
  }

  @Get("metrics")
  metrics(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-metrics-token") headerToken: string | undefined,
    @Res({ passthrough: true }) response: ResponseContext,
  ) {
    if (process.env.METRICS_ENABLED !== "true")
      throw new NotFoundException({ code: "NOT_FOUND", message: "Not found." });
    const bearer = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : undefined;
    if (
      !process.env.METRICS_TOKEN ||
      (bearer ?? headerToken) !== process.env.METRICS_TOKEN
    )
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "A valid metrics token is required.",
      });
    response.setHeader(
      "Content-Type",
      "text/plain; version=0.0.4; charset=utf-8",
    );
    response.setHeader("Cache-Control", "no-store");
    return prometheusMetrics();
  }
}
