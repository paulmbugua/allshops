export function assertSafeTestDatabase(environment = process.env) {
  if (environment.NODE_ENV === "production")
    throw new Error(
      "Destructive tests are forbidden when NODE_ENV=production.",
    );
  const url = new URL(environment.DATABASE_URL ?? "");
  const database = url.pathname.replace(/^\//, "").toLowerCase();
  const explicitlyLocal = ["localhost", "127.0.0.1", "postgres"].includes(
    url.hostname,
  );
  const namedForTests = database.includes("test");
  if (!explicitlyLocal && !namedForTests)
    throw new Error(
      `Refusing destructive tests against ${url.hostname}/${database}; use a local or explicitly named test database.`,
    );
}
