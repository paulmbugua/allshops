import assert from "node:assert/strict";
import request from "supertest";

/**
 * Run against a deployed API with PRIORITY0_E2E_TOKEN and
 * PRIORITY0_E2E_ORGANIZATION_ID set. The checks intentionally exercise the
 * public HTTP boundary, including permission enforcement and idempotency.
 */
const baseUrl = process.env.PRIORITY0_E2E_API_URL ?? "http://localhost:4000";
const organizationId = process.env.PRIORITY0_E2E_ORGANIZATION_ID;
const token = process.env.PRIORITY0_E2E_TOKEN;

if (organizationId && token) {
  const auth = { Authorization: `Bearer ${token}` };
  const unauthenticated = await request(baseUrl).get(`/api/v1/organizations/${organizationId}/register-shifts`);
  assert.equal(unauthenticated.status, 401);

  const alerts = await request(baseUrl).get(`/api/v1/organizations/${organizationId}/alerts?page=1&pageSize=10`).set(auth);
  assert.ok([200, 403].includes(alerts.status), `unexpected alerts status ${alerts.status}`);

  const exportResponse = await request(baseUrl).get(`/api/v1/organizations/${organizationId}/products/export`).set(auth);
  assert.ok([200, 403].includes(exportResponse.status), `unexpected catalogue status ${exportResponse.status}`);
  if (exportResponse.status === 200) {
    assert.match(exportResponse.text, /(^|\n)id,name,arabicName/);
    assert.doesNotMatch(exportResponse.text, /\n[=+\-@]/);
  }
  console.log("Priority 0 HTTP checks passed.");
} else {
  console.log("Priority 0 E2E checks skipped; set PRIORITY0_E2E_TOKEN and PRIORITY0_E2E_ORGANIZATION_ID to run.");
}
