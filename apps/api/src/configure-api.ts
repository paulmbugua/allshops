import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ApiExceptionFilter } from "./api-exception.filter.js";
import { incrementMetric, recordHttpRequest } from "./observability.js";
import type { RequestContext, ResponseContext } from "./security.types.js";

type Next = () => void;

export function parseTrustProxy(
  value: string | undefined,
): string | number | boolean {
  const trustProxy = value?.trim() || "false";
  const normalized = trustProxy.toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  if (/^\d+$/.test(trustProxy)) return Number(trustProxy);
  return trustProxy;
}

export function configureApi(app: INestApplication): void {
  app.setGlobalPrefix("api/v1");
  const origins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin(
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) {
      if (!origin || origins.includes(origin)) callback(null, true);
      else callback(new Error("Origin is not allowed by CORS"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "X-Request-Id",
      "Idempotency-Key",
    ],
    exposedHeaders: ["X-Request-Id"],
  });
  (
    app as INestApplication & {
      useBodyParser(type: string, options: { limit: string }): void;
    }
  ).useBodyParser("json", { limit: process.env.JSON_BODY_LIMIT ?? "1mb" });
  const express = app.getHttpAdapter().getInstance() as {
    set(name: string, value: string | number | boolean): void;
  };
  express.set("trust proxy", parseTrustProxy(process.env.TRUST_PROXY));
  app.use((request: RequestContext, response: ResponseContext, next: Next) => {
    const supplied = request.headers["x-request-id"];
    const suppliedId = Array.isArray(supplied) ? supplied[0] : supplied;
    request.requestId =
      process.env.TRUST_INCOMING_REQUEST_ID === "true" &&
      suppliedId &&
      /^[a-zA-Z0-9._-]{1,100}$/.test(suppliedId)
        ? suppliedId
        : randomUUID();
    response.setHeader("X-Request-Id", request.requestId);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    response.setHeader("Cross-Origin-Resource-Policy", "same-site");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    response.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    const startedAt = Date.now();
    response.setTimeout?.(Number(process.env.REQUEST_TIMEOUT_MS ?? 30_000));
    response.on?.("finish", () => {
      const durationMs = Date.now() - startedAt;
      recordHttpRequest(
        request.method ?? "UNKNOWN",
        request.originalUrl ?? "unknown",
        response.statusCode,
        durationMs,
      );
      const route = request.originalUrl?.split("?")[0] ?? "";
      if (route.endsWith("/sales/checkout"))
        incrementMetric(
          response.statusCode < 400
            ? "allshops_checkout_total"
            : "allshops_checkout_failure_total",
        );
      if (route.endsWith("/sync/sales"))
        incrementMetric(
          response.statusCode < 400
            ? "allshops_offline_sync_total"
            : "allshops_offline_sync_conflict_total",
        );
      if (response.statusCode === 409 && route.includes("/inventory/"))
        incrementMetric("allshops_inventory_conflict_total");
      if (
        process.env.NODE_ENV !== "test" ||
        process.env.TEST_REQUEST_LOGS === "true"
      )
        process.stdout.write(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            level: "info",
            service: "allshops-api",
            environment: process.env.NODE_ENV,
            requestId: request.requestId,
            userId: request.user?.id,
            organizationId: request.tenant?.organizationId,
            method: request.method,
            route: request.originalUrl?.split("?")[0],
            statusCode: response.statusCode,
            durationMs,
          }) + "\n",
        );
    });
    next();
  });
  app.use((request: RequestContext, response: ResponseContext, next: Next) => {
    const route = request.originalUrl?.split("?")[0] ?? "";
    const mutation = !["GET", "HEAD", "OPTIONS"].includes(
      request.method?.toUpperCase() ?? "GET",
    );
    const exempt = [
      "/api/v1/health",
      "/api/v1/version",
      "/api/v1/metrics",
      "/api/v1/auth",
      "/api/v1/platform",
    ].some((prefix) => route.startsWith(prefix));
    if (process.env.MAINTENANCE_MODE === "true" && mutation && !exempt) {
      response.setHeader("Retry-After", "300");
      response.status(503).json({
        statusCode: 503,
        code: "MAINTENANCE",
        message:
          "AllShops is temporarily under maintenance. New transactions are unavailable.",
        requestId: request.requestId,
      });
      return;
    }
    next();
  });
  app.useGlobalFilters(new ApiExceptionFilter());
}
