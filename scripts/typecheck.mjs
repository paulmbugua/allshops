import { compile } from "./typescript.mjs";

const projects = [
  "packages/contracts/tsconfig.json",
  "packages/database/tsconfig.json",
  "packages/ui/tsconfig.json",
  "apps/api/tsconfig.json",
  "apps/worker/tsconfig.json",
  "apps/web/tsconfig.json",
];

for (const project of projects) {
  compile(project, { noEmit: true });
  console.log(`Typecheck passed: ${project}`);
}
