import { readFile } from "node:fs/promises";

const checks = [
  ["pilot lifecycle schema", "packages/database/prisma/schema.prisma", ["model PilotOrganization", "enum PilotStatus"]],
  ["feature flag schema", "packages/database/prisma/schema.prisma", ["model OrganizationFeatureFlag"]],
  ["onboarding schema", "packages/database/prisma/schema.prisma", ["model OrganizationOnboardingStep"]],
  ["support schema", "packages/database/prisma/schema.prisma", ["model SupportIssue", "model PilotFeedback"]],
  ["pilot API", "apps/api/src/pilot.controller.ts", ["pilot-readiness", "platform/pilots", "support/diagnostics"]],
  ["readiness service", "apps/api/src/pilot.service.ts", ["SUBSCRIPTION_USABLE", "DEVICE_REGISTERED", "PILOT_NOT_READY"]],
  ["pilot documentation", "docs/pilot/uat-checklist.md", ["MANUAL PILOT VERIFICATION REQUIRED"]],
];
for (const [name, file, needles] of checks) {
  const source = await readFile(file, "utf8");
  for (const needle of needles) if (!source.includes(needle)) throw new Error(`${name}: missing ${needle}`);
  console.log(`PASS ${name}`);
}
console.log("Phase 10 pilot foundation checks passed.");
