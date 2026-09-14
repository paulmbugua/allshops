import { spawnSync } from "node:child_process";

for (const service of ["web", "api", "worker"]) {
  const result = spawnSync(
    "docker",
    [
      "build",
      "--pull",
      "-f",
      `apps/${service}/Dockerfile`,
      "-t",
      `allshops-${service}:local`,
      ".",
    ],
    { stdio: "inherit", shell: process.platform === "win32" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
