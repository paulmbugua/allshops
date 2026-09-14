const base = (process.env.SMOKE_BASE_URL ?? "http://localhost:8080").replace(
  /\/$/,
  "",
);
const checks = [
  ["web", "/login"],
  ["api live", "/api/v1/health/live"],
  ["api ready", "/api/v1/health/ready"],
  ["public plans", "/api/v1/plans"],
  ["version", "/api/v1/version"],
];
for (const [name, route] of checks) {
  const started = performance.now();
  const response = await fetch(`${base}${route}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(`${name} failed with HTTP ${response.status}`);
  console.log(
    `${name}: ${response.status} in ${Math.round(performance.now() - started)}ms`,
  );
}
console.log("Production-safe smoke test passed; no business writes were made.");
