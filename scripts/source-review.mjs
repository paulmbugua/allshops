import fs from "node:fs";
import path from "node:path";

const ignoredDirectories = new Set([
  ".git",
  ".next",
  "node_modules",
  "dist",
  "test-dist",
  "coverage",
]);
const allowedExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".yml",
  ".yaml",
  ".sh",
]);

function sourceFiles(directory = process.cwd()) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".env")) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name))
        files.push(...sourceFiles(target));
    } else if (allowedExtensions.has(path.extname(entry.name)))
      files.push(target);
  }
  return files;
}

const rules = [
  { pattern: /queryRawUnsafe|executeRawUnsafe/g, label: "unsafe raw SQL" },
  { pattern: /dangerouslySetInnerHTML/g, label: "unsafe HTML rendering" },
  {
    pattern:
      /JWT_(ACCESS|REFRESH)_SECRET\s*[=:]\s*['"](secret|password|change-me)['"]/g,
    label: "hardcoded weak JWT secret",
  },
];

const findings = [];
for (const file of sourceFiles()) {
  if (
    file.endsWith("source-review.mjs") ||
    file.includes(`${path.sep}test${path.sep}`)
  )
    continue;
  const contents = fs.readFileSync(file, "utf8");
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    let match;
    while ((match = rule.pattern.exec(contents))) {
      const line = contents.slice(0, match.index).split(/\r?\n/).length;
      findings.push(
        `${path.relative(process.cwd(), file)}:${line}: ${rule.label}`,
      );
    }
  }
}

if (findings.length) {
  console.error(findings.join("\n"));
  process.exit(1);
}
console.log("Security source audit passed: no prohibited patterns found.");
