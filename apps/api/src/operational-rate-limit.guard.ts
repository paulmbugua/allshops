import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import type { RequestContext } from "./security.types.js";

interface Bucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class OperationalRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestContext>();
    const response = context.switchToHttp().getResponse<{
      setHeader(name: string, value: string): void;
    }>();
    const route = request.originalUrl?.split("?")[0] ?? "unknown";
    const configured = route.includes("/sync/")
      ? Number(process.env.SYNC_RATE_LIMIT_MAX ?? 60)
      : route.endsWith("/export")
        ? Number(process.env.EXPORT_RATE_LIMIT_MAX ?? 10)
        : route.includes("/billing") || route.includes("/subscription")
          ? Number(process.env.BILLING_RATE_LIMIT_MAX ?? 20)
          : 0;
    if (!configured) return true;

    const windowMs = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 60_000);
    const now = Date.now();
    const address = request.ip ?? request.socket?.remoteAddress ?? "unknown";
    const identity = request.user?.id ?? address;
    const category = route.includes("/sync/")
      ? "sync"
      : route.endsWith("/export")
        ? "export"
        : "billing";
    const key = `${identity}:${category}`;
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    bucket.count += 1;
    if (bucket.count <= configured) return true;
    response.setHeader(
      "Retry-After",
      String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))),
    );
    throw new HttpException(
      { code: "RATE_LIMITED", message: "Too many requests. Retry later." },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
