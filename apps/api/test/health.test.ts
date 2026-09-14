import assert from "node:assert/strict";

import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module.js";

const module = await Test.createTestingModule({
  imports: [AppModule],
}).compile();
const app = module.createNestApplication();

try {
  app.setGlobalPrefix("api/v1");
  await app.init();

  const response = await request(app.getHttpServer()).get("/api/v1/health");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    status: "ok",
    service: "allshops-api",
    version: "0.0.0",
  });
  console.log("API foundation test passed: GET /api/v1/health returned 200.");
} finally {
  await app.close();
}
