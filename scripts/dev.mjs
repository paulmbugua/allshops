import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { compile, root } from "./typescript.mjs";

const projects = [
  "packages/contracts/tsconfig.build.json",
  "packages/database/tsconfig.build.json",
  "packages/ui/tsconfig.build.json",
  "apps/api/tsconfig.build.json",
  "apps/worker/tsconfig.build.json",
];

for (const project of projects) {
  compile(project);
  console.log(`Compiled: ${project}`);
}

await import(pathToFileURL(path.join(root, "apps/api/dist/main.js")).href);
await import(pathToFileURL(path.join(root, "apps/worker/dist/main.js")).href);

const webDirectory = path.join(root, "apps/web");
const requireFromWeb = createRequire(path.join(webDirectory, "package.json"));
const next = requireFromWeb("next");
const web = next({
  dev: true,
  dir: webDirectory,
  hostname: "localhost",
  port: 3000,
});

await web.prepare();

const server = createServer(web.getRequestHandler());
server.listen(3000, "localhost", () => {
  console.log("Web listening on http://localhost:3000");
});

async function shutdown() {
  server.close();
  await web.close();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
