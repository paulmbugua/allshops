import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { createHash } from "node:crypto";

import type { RequestContext } from "./security.types.js";

interface Bucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestContext>();
    const response = context.switchToHttp().getResponse<{
      setHeader(name: string, value: string): void;
    }>();
    const now = Date.now();
    const windowMs = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 60000);
    const route = request.originalUrl?.split("?")[0] ?? "auth";
    const max = route.endsWith("/login")
      ? Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 10)
      : route.endsWith("/register")
        ? Number(process.env.REGISTER_RATE_LIMIT_MAX ?? 5)
        : route.endsWith("/refresh")
          ? Number(process.env.REFRESH_RATE_LIMIT_MAX ?? 30)
          : Number(process.env.AUTH_RATE_LIMIT_MAX ?? 20);
    const address = request.ip ?? request.socket?.remoteAddress ?? "unknown";
    const principal =
      typeof request.body?.email === "string"
        ? createHash("sha256")
            .update(request.body.email.trim().toLowerCase())
            .digest("hex")
            .slice(0, 16)
        : "anonymous";
    const key = `${address}:${route}:${principal}`;
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    bucket.count += 1;
    if (bucket.count > max) {
      response.setHeader(
        "Retry-After",
        String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))),
      );
      throw new HttpException(
        {
          code: "RATE_LIMITED",
          message: "Too many authentication attempts. Please try again later.",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
