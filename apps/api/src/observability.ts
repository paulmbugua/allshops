import { createHash, randomBytes } from "node:crypto";

interface RequestMetric {
  count: number;
  totalDurationMs: number;
  failures: number;
  recentDurationsMs: number[];
}

const requests = new Map<string, RequestMetric>();
const domainCounters = new Map<string, number>();

function safeRoute(route: string): string {
  return route
    .split("?")[0]!
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id")
    .replace(/\/\d+(?=\/|$)/g, "/:id");
}

export function recordHttpRequest(
  method: string,
  route: string,
  status: number,
  durationMs: number,
): void {
  const key = `${method.toUpperCase()} ${safeRoute(route)} ${status}`;
  const current = requests.get(key) ?? {
    count: 0,
    totalDurationMs: 0,
    failures: 0,
    recentDurationsMs: [],
  };
  current.count += 1;
  current.totalDurationMs += durationMs;
  current.recentDurationsMs.push(durationMs);
  if (current.recentDurationsMs.length > 2_000)
    current.recentDurationsMs.shift();
  if (status >= 500) current.failures += 1;
  requests.set(key, current);
}

export interface PerformanceSummary {
  method: string;
  route: string;
  requests: number;
  averageMs: number;
  p95Ms: number;
}

/** Returns bounded, normalized timings suitable for smoke-test output. */
export function performanceSummary(): PerformanceSummary[] {
  const grouped = new Map<string, number[]>();
  for (const [key, metric] of requests) {
    const [method, route] = key.split(" ");
    const groupKey = `${method} ${route}`;
    const durations = grouped.get(groupKey) ?? [];
    durations.push(...metric.recentDurationsMs);
    grouped.set(groupKey, durations);
  }
  return [...grouped.entries()]
    .map(([key, durations]) => {
      durations.sort((left, right) => left - right);
      const [method, route] = key.split(" ");
      const p95Index = Math.max(0, Math.ceil(durations.length * 0.95) - 1);
      return {
        method: method!,
        route: route!,
        requests: durations.length,
        averageMs: Math.round(
          durations.reduce((total, value) => total + value, 0) /
            Math.max(durations.length, 1),
        ),
        p95Ms: durations[p95Index] ?? 0,
      };
    })
    .sort((left, right) => right.requests - left.requests);
}

export function incrementMetric(name: string): void {
  domainCounters.set(name, (domainCounters.get(name) ?? 0) + 1);
}

function label(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function prometheusMetrics(): string {
  const lines = [
    "# HELP allshops_http_requests_total HTTP responses by normalized route and status.",
    "# TYPE allshops_http_requests_total counter",
    "# HELP allshops_http_request_duration_ms_total Aggregate HTTP response time in milliseconds.",
    "# TYPE allshops_http_request_duration_ms_total counter",
    "# HELP allshops_http_5xx_total HTTP server failures.",
    "# TYPE allshops_http_5xx_total counter",
  ];
  for (const [key, metric] of requests) {
    const [method, route, status] = key.split(" ");
    const labels = `method="${label(method!)}",route="${label(route!)}",status="${status}"`;
    lines.push(`allshops_http_requests_total{${labels}} ${metric.count}`);
    lines.push(
      `allshops_http_request_duration_ms_total{${labels}} ${metric.totalDurationMs}`,
    );
    lines.push(`allshops_http_5xx_total{${labels}} ${metric.failures}`);
  }
  for (const [name, value] of domainCounters) lines.push(`${name} ${value}`);
  return `${lines.join("\n")}\n`;
}

export interface ErrorContext {
  requestId?: string;
  route?: string;
  method?: string;
  userId?: string;
  organizationId?: string;
}

export function safeError(error: unknown): {
  name: string;
  message: string;
  stack?: string;
} {
  if (error instanceof Error)
    return { name: error.name, message: error.message, stack: error.stack };
  return { name: "UnknownError", message: "Unknown application error" };
}

export function captureError(error: unknown, context: ErrorContext): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    const parsed = new URL(dsn);
    const projectId = parsed.pathname.replace(/^\//, "");
    if (!projectId || !parsed.username) return;
    const eventId = randomBytes(16).toString("hex");
    const endpoint = `${parsed.protocol}//${parsed.host}/api/${projectId}/envelope/?sentry_key=${parsed.username}&sentry_version=7`;
    const safe = safeError(error);
    const header = JSON.stringify({ event_id: eventId, dsn });
    const item = JSON.stringify({ type: "event" });
    const event = JSON.stringify({
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: "node",
      environment: process.env.NODE_ENV,
      release: process.env.APP_VERSION,
      level: "error",
      exception: {
        values: [
          { type: safe.name, value: safe.message, stacktrace: safe.stack },
        ],
      },
      tags: {
        requestId: context.requestId,
        route: context.route,
        method: context.method,
      },
      contexts: {
        allshops: {
          userIdHash: context.userId
            ? createHash("sha256")
                .update(context.userId)
                .digest("hex")
                .slice(0, 16)
            : undefined,
          organizationIdHash: context.organizationId
            ? createHash("sha256")
                .update(context.organizationId)
                .digest("hex")
                .slice(0, 16)
            : undefined,
        },
      },
    });
    void fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-sentry-envelope" },
      body: `${header}\n${item}\n${event}`,
      signal: AbortSignal.timeout(2_000),
    }).catch(() => undefined);
  } catch {
    // Monitoring must never prevent application traffic.
  }
}
