import { z } from "zod";

const workerEnvironmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
  SUBSCRIPTION_GRACE_DAYS: z.coerce.number().int().positive().default(7),
  SUBSCRIPTION_JOB_INTERVAL_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(4001),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  APP_VERSION: z.string().min(1).default("0.0.0"),
  GIT_SHA: z.string().min(1).default("development"),
  NODE_ENV: z.enum(["development", "test", "production"]),
});

export function validateWorkerEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const result = workerEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    const invalidVariables = result.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(
      `Invalid or missing worker environment variables: ${invalidVariables}`,
    );
  }

  return result.data;
}
