import { createRequire } from "node:module";
import path from "node:path";

import { compile, root } from "./typescript.mjs";

const serverAndPackageProjects = [
  "packages/contracts/tsconfig.build.json",
  "packages/database/tsconfig.build.json",
  "packages/ui/tsconfig.build.json",
  "apps/api/tsconfig.build.json",
  "apps/worker/tsconfig.build.json",
];

for (const project of serverAndPackageProjects) {
  compile(project);
  console.log(`Build passed: ${project}`);
}

const webDirectory = path.join(root, "apps/web");
const requireFromWeb = createRequire(path.join(webDirectory, "package.json"));
const { nextBuild } = requireFromWeb("next/dist/cli/next-build");

await nextBuild(
  {
    debug: false,
    debugPrerender: false,
    experimentalAppOnly: false,
    experimentalDebugMemoryUsage: false,
    lint: true,
    mangling: true,
    profile: false,
    turbo: false,
    turbopack: false,
  },
  webDirectory,
);
