import { z } from "zod";

const booleanValue = z.preprocess(
  (value) =>
    typeof value === "string" ? value.trim().toLowerCase() === "true" : value,
  z.boolean(),
);

const environmentSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().url(),
    JWT_ACCESS_SECRET: z.string().min(1),
    JWT_REFRESH_SECRET: z.string().min(1),
    JWT_ACCESS_TTL: z
      .string()
      .regex(/^\d+[smhd]$/)
      .default("15m"),
    JWT_REFRESH_TTL: z
      .string()
      .regex(/^\d+[smhd]$/)
      .default("7d"),
    APP_URL: z.string().url(),
    API_URL: z.string().url(),
    CORS_ORIGINS: z.string().min(1).default("http://localhost:3000"),
    TRUST_PROXY: z.string().default("false"),
    TRUST_INCOMING_REQUEST_ID: booleanValue.default(false),
    SWAGGER_ENABLED: booleanValue.default(false),
    MAINTENANCE_MODE: booleanValue.default(false),
    JSON_BODY_LIMIT: z
      .string()
      .regex(/^\d+(kb|mb)$/i)
      .default("1mb"),
    PRODUCT_IMAGE_DIRECTORY: z.string().min(1).default("var/product-images"),
    PRODUCT_IMAGE_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(5 * 1024 * 1024)
      .default(5 * 1024 * 1024),
    REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(120000)
      .default(30000),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    SLOW_QUERY_THRESHOLD_MS: z.coerce.number().int().positive().default(1000),
    SENTRY_DSN: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().url().optional(),
    ),
    APP_VERSION: z.string().min(1).default("0.0.0"),
    GIT_SHA: z.string().min(1).default("development"),
    BUILD_TIME: z.string().min(1).default("development"),
    METRICS_ENABLED: booleanValue.default(false),
    METRICS_TOKEN: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(24).optional(),
    ),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(60000),
    LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    REGISTER_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
    REFRESH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
    SYNC_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
    EXPORT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    BILLING_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
    INVITATION_TTL_HOURS: z.coerce.number().positive().default(48),
    REPORT_EXPORT_MAX_ROWS: z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .default(50000),
    REPORT_CACHE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(0)
      .max(3600)
      .default(60),
    REPORT_MAX_RANGE_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(3660)
      .default(366),
    OFFLINE_SESSION_MAX_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(168)
      .default(24),
    OFFLINE_PRICE_MAX_AGE_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(720)
      .default(72),
    OFFLINE_CLOCK_SKEW_HOURS: z.coerce
      .number()
      .int()
      .min(0)
      .max(72)
      .default(24),
    SYNC_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(50),
    TRIAL_DAYS: z.coerce.number().int().positive().default(30),
    SUBSCRIPTION_GRACE_DAYS: z.coerce.number().int().positive().default(7),
    SUBSCRIPTION_JOB_INTERVAL_MINUTES: z.coerce
      .number()
      .int()
      .positive()
      .default(60),
    PAYSTACK_SECRET_KEY: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
    PAYSTACK_BASE_URL: z.string().url().default("https://api.paystack.co"),
    PAYSTACK_CALLBACK_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().url().optional(),
    ),
    PAYSTACK_SUBSCRIPTION_CALLBACK_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().url().optional(),
    ),
    PAYSTACK_CURRENCY: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default("KES"),
    PAYSTACK_QAR_TO_KES_RATE: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.coerce.number().positive().optional(),
    ),
    NODE_ENV: z.enum(["development", "test", "production"]),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV !== "production") return;

    const weakSecrets = new Set([
      "secret",
      "password",
      "change-me",
      "test-access-secret",
      "test-refresh-secret",
    ]);
    for (const field of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const) {
      const secret = environment[field];
      if (secret.length < 32 || weakSecrets.has(secret.toLowerCase())) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message:
            "Production JWT secrets must be at least 32 characters and non-trivial.",
        });
      }
    }
    if (environment.JWT_ACCESS_SECRET === environment.JWT_REFRESH_SECRET) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_REFRESH_SECRET"],
        message: "Access and refresh secrets must be different in production.",
      });
    }
    if (new URL(environment.APP_URL).protocol !== "https:") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["APP_URL"],
        message: "Production APP_URL must use HTTPS.",
      });
    }
    const origins = environment.CORS_ORIGINS.split(",").map((item) =>
      item.trim(),
    );
    if (
      origins.some(
        (origin) => origin === "*" || new URL(origin).protocol !== "https:",
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ORIGINS"],
        message: "Production CORS origins must be explicit HTTPS origins.",
      });
    }
    if (environment.METRICS_ENABLED && !environment.METRICS_TOKEN) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["METRICS_TOKEN"],
        message: "A metrics token is required when metrics are enabled.",
      });
    }
  });

export type ApiEnvironment = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): ApiEnvironment {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    const missing = result.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(`Invalid or missing API environment variables: ${missing}`);
  }

  return result.data;
}
