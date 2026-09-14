import { pathToFileURL } from "node:url";
import path from "node:path";
import { compile, root } from "./typescript.mjs";
import { assertSafeTestDatabase } from "./test-safety.mjs";

process.env.DATABASE_URL ??=
  "postgresql://allshops:allshops@localhost:5433/allshops_test?schema=public";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret";
process.env.APP_URL ??= "http://localhost:3000";
process.env.API_URL ??= "http://localhost:4000";
process.env.CORS_ORIGINS ??= "http://localhost:3000";
process.env.NODE_ENV = "test";
assertSafeTestDatabase();

const group = process.argv[2];
if (!new Set(["critical", "security"]).has(group))
  throw new Error("Expected test group: critical or security");

compile("packages/database/tsconfig.build.json");
compile("packages/contracts/tsconfig.build.json");
compile("apps/api/tsconfig.test.json");

const tests =
  group === "critical"
    ? [
        "sales-calculation.test.js",
        "phase2.e2e.test.js",
        "phase3.e2e.test.js",
        "phase4.e2e.test.js",
        "phase5.e2e.test.js",
        "phase7.e2e.test.js",
        "phase8.e2e.test.js",
        "paystack.e2e.test.js",
      ]
    : [
        "phase1.e2e.test.js",
        "phase6.e2e.test.js",
        "phase7.e2e.test.js",
        "phase8.e2e.test.js",
        "phase9.test.js",
      ];

for (const file of tests)
  await import(
    pathToFileURL(path.join(root, "apps/api/test-dist/test", file)).href
  );

console.log(`Phase 9 ${group} test group passed (${tests.length} suites).`);
