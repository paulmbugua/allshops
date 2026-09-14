import { pathToFileURL } from "node:url";
import path from "node:path";

import { compile, root } from "./typescript.mjs";

process.env.DATABASE_URL ??=
  "postgresql://allshops:allshops@localhost:5433/allshops?schema=public";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret";
process.env.JWT_ACCESS_TTL ??= "15m";
process.env.JWT_REFRESH_TTL ??= "7d";
process.env.APP_URL ??= "http://localhost:3000";
process.env.API_URL ??= "http://localhost:4000";
process.env.CORS_ORIGINS ??= "http://localhost:3000";
process.env.NODE_ENV = "test";
process.env.PAYSTACK_SECRET_KEY ??= "sk_test_allshops_test_only";
process.env.PAYSTACK_CURRENCY ??= "QAR";
process.env.PAYSTACK_SUBSCRIPTION_CALLBACK_URL ??=
  "http://localhost:3000/settings/subscription/payment-return";

async function runTest(relativePath) {
  await import(pathToFileURL(path.join(root, relativePath)).href);
}

compile("packages/database/tsconfig.build.json");
compile("packages/contracts/tsconfig.build.json");
compile("packages/contracts/tsconfig.test.json");
await runTest("packages/contracts/test-dist/test/contracts.test.js");
compile("apps/api/tsconfig.test.json");
await runTest("apps/api/test-dist/test/health.test.js");
await runTest("apps/api/test-dist/test/sales-calculation.test.js");
await runTest("apps/api/test-dist/test/phase1.e2e.test.js");
await runTest("apps/api/test-dist/test/phase2.e2e.test.js");
await runTest("apps/api/test-dist/test/phase3.e2e.test.js");
await runTest("apps/api/test-dist/test/phase4.e2e.test.js");
await runTest("apps/api/test-dist/test/phase5.e2e.test.js");
await runTest("apps/api/test-dist/test/phase6.e2e.test.js");
await runTest("apps/api/test-dist/test/phase7.e2e.test.js");
await runTest("apps/api/test-dist/test/phase8.e2e.test.js");
await runTest("apps/api/test-dist/test/paystack.e2e.test.js");
await runTest("apps/api/test-dist/test/phase9.test.js");
compile("apps/web/tsconfig.test.json");
await runTest("apps/web/test-dist/test/offline-db.test.js");

const { performanceSummary } = await import(
  pathToFileURL(path.join(root, "apps/api/dist/observability.js")).href
);
const representativeRoutes = performanceSummary().filter(({ route }) =>
  ["/sales/checkout", "/sync/sales", "/reports/dashboard", "/products"].some(
    (suffix) => route.endsWith(suffix),
  ),
);
console.log(
  `Measured integration latency: ${JSON.stringify(representativeRoutes)}`,
);

console.log("All Phase 0 through Phase 9 regression tests passed.");
