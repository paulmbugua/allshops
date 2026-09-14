import fs from "node:fs";
import path from "node:path";

const root = path.resolve("packages/database/prisma/migrations");
const risky = /\b(DROP\s+(TABLE|COLUMN)|ALTER\s+TYPE|SET\s+NOT\s+NULL)\b/i;
const findings = [];
for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = path.join(root, entry.name, "migration.sql");
  if (!fs.existsSync(file)) continue;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (risky.test(line) && !line.trim().startsWith("--"))
      findings.push(
        `${path.relative(process.cwd(), file)}:${index + 1}: ${line.trim()}`,
      );
  });
}
if (findings.length) {
  console.warn("Potentially risky migration operations require human review:");
  console.warn(findings.join("\n"));
} else
  console.log(
    "Migration audit passed: no obvious destructive operations found.",
  );
