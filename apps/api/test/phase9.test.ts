import assert from "node:assert/strict";
import { Controller, Get } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { ApiExceptionFilter } from "../src/api-exception.filter.js";
import { AppModule } from "../src/app.module.js";
import { configureApi } from "../src/configure-api.js";
import { setRefreshCookie } from "../src/cookies.js";
import { validateEnvironment } from "../src/environment.js";
import { Public } from "../src/public.decorator.js";

const base = {
  DATABASE_URL: "postgresql://allshops:allshops@localhost:5432/allshops_test",
  REDIS_URL: "redis://localhost:6379",
  JWT_ACCESS_SECRET: "development-access",
  JWT_REFRESH_SECRET: "development-refresh",
  APP_URL: "http://localhost:3000",
  API_URL: "http://localhost:4000",
  CORS_ORIGINS: "http://localhost:3000",
  NODE_ENV: "development",
};
assert.equal(validateEnvironment(base).NODE_ENV, "development");
assert.throws(
  () =>
    validateEnvironment({
      ...base,
      NODE_ENV: "production",
      APP_URL: "https://app.example.com",
      API_URL: "https://api.example.com",
      CORS_ORIGINS: "https://app.example.com",
      JWT_ACCESS_SECRET: "secret",
      JWT_REFRESH_SECRET: "password",
    }),
  /JWT_ACCESS_SECRET|JWT_REFRESH_SECRET/,
);
assert.equal(
  validateEnvironment({
    ...base,
    NODE_ENV: "production",
    APP_URL: "https://app.example.com",
    API_URL: "https://api.example.com",
    CORS_ORIGINS: "https://app.example.com,https://admin.example.com",
    JWT_ACCESS_SECRET: "a-strong-production-access-secret-0001",
    JWT_REFRESH_SECRET: "a-different-production-refresh-secret-0002",
  }).NODE_ENV,
  "production",
);

const cookieHeaders: Record<string, string | readonly string[]> = {};
process.env.NODE_ENV = "production";
setRefreshCookie(
  {
    statusCode: 200,
    getHeader: () => undefined,
    setHeader: (name, value) => {
      cookieHeaders[name] = value;
    },
    status() {
      return this;
    },
    json() {},
  },
  "opaque-token",
  3600,
);
assert.match(String(cookieHeaders["Set-Cookie"]), /HttpOnly/);
assert.match(String(cookieHeaders["Set-Cookie"]), /Secure/);
assert.match(String(cookieHeaders["Set-Cookie"]), /SameSite=Lax/);

process.env.NODE_ENV = "test";
process.env.CORS_ORIGINS = "http://localhost:3000";
process.env.METRICS_ENABLED = "false";
const module = await Test.createTestingModule({
  imports: [AppModule],
}).compile();
const app = module.createNestApplication();
configureApi(app);
await app.init();
try {
  const live = await request(app.getHttpServer()).get("/api/v1/health/live");
  assert.equal(live.status, 200);
  assert.equal(live.headers["x-content-type-options"], "nosniff");
  assert.equal(live.headers["x-frame-options"], "DENY");
  assert.ok(live.headers["x-request-id"]);
  assert.equal(live.headers["cache-control"], "no-store");

  const untrustedRequestId = await request(app.getHttpServer())
    .get("/api/v1/health/live")
    .set("X-Request-Id", "attacker-controlled");
  assert.notEqual(
    untrustedRequestId.headers["x-request-id"],
    "attacker-controlled",
  );

  const version = await request(app.getHttpServer()).get("/api/v1/version");
  assert.equal(version.status, 200);
  assert.equal(version.body.version, "0.0.0");

  const metrics = await request(app.getHttpServer()).get("/api/v1/metrics");
  assert.equal(metrics.status, 404);

  const cors = await request(app.getHttpServer())
    .get("/api/v1/health/live")
    .set("Origin", "http://localhost:3000");
  assert.equal(
    cors.headers["access-control-allow-origin"],
    "http://localhost:3000",
  );
  const blockedCors = await request(app.getHttpServer())
    .get("/api/v1/health/live")
    .set("Origin", "https://untrusted.example");
  assert.notEqual(
    blockedCors.headers["access-control-allow-origin"],
    "https://untrusted.example",
  );
} finally {
  await app.close();
}

@Public()
@Controller("boom")
class BoomController {
  @Get()
  run(): never {
    throw new Error("private stack marker");
  }
}
const errorModule = await Test.createTestingModule({
  controllers: [BoomController],
}).compile();
const errorApp = errorModule.createNestApplication();
errorApp.setGlobalPrefix("api/v1");
errorApp.useGlobalFilters(new ApiExceptionFilter());
await errorApp.init();
try {
  const failure = await request(errorApp.getHttpServer()).get("/api/v1/boom");
  assert.equal(failure.status, 500);
  assert.equal(failure.body.code, "INTERNAL_ERROR");
  assert.equal(failure.body.message, "An unexpected error occurred.");
  assert.doesNotMatch(JSON.stringify(failure.body), /private stack marker/);
} finally {
  await errorApp.close();
}

console.log("Phase 9 production configuration and HTTP security tests passed.");
