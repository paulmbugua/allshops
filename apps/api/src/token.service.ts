import { Injectable, UnauthorizedException } from "@nestjs/common";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

type TokenType = "access" | "refresh";

export interface TokenPayload {
  sub: string;
  type: TokenType;
  sid?: string;
  jti: string;
  iat: number;
  exp: number;
}

function parseTtl(value: string, fallback: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value || fallback);
  if (!match) {
    throw new Error(`Invalid token TTL: ${value}`);
  }
  const amount = Number(match[1]);
  const units = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * units[match[2] as keyof typeof units];
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

@Injectable()
export class TokenService {
  readonly accessTtlSeconds = parseTtl(
    process.env.JWT_ACCESS_TTL ?? "15m",
    "15m",
  );
  readonly refreshTtlSeconds = parseTtl(
    process.env.JWT_REFRESH_TTL ?? "7d",
    "7d",
  );

  createAccessToken(userId: string): string {
    return this.sign(userId, "access", this.accessTtlSeconds);
  }

  createRefreshToken(userId: string, sessionId: string): string {
    return this.sign(userId, "refresh", this.refreshTtlSeconds, sessionId);
  }

  verifyAccessToken(token: string): TokenPayload {
    return this.verify(token, "access");
  }

  verifyRefreshToken(token: string): TokenPayload {
    return this.verify(token, "refresh");
  }

  hashRefreshToken(token: string): string {
    return createHmac("sha256", process.env.JWT_REFRESH_SECRET!)
      .update(token)
      .digest("hex");
  }

  refreshHashMatches(token: string, expected: string): boolean {
    const actual = Buffer.from(this.hashRefreshToken(token), "hex");
    const stored = Buffer.from(expected, "hex");
    return actual.length === stored.length && timingSafeEqual(actual, stored);
  }

  invitationHash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  randomInvitationToken(): string {
    return randomBytes(32).toString("base64url");
  }

  private sign(
    userId: string,
    type: TokenType,
    ttlSeconds: number,
    sessionId?: string,
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const header = encode({ alg: "HS256", typ: "JWT" });
    const payload = encode({
      sub: userId,
      type,
      ...(sessionId ? { sid: sessionId } : {}),
      jti: randomUUID(),
      iat: now,
      exp: now + ttlSeconds,
    });
    const unsigned = `${header}.${payload}`;
    const signature = createHmac(
      "sha256",
      type === "access"
        ? process.env.JWT_ACCESS_SECRET!
        : process.env.JWT_REFRESH_SECRET!,
    )
      .update(unsigned)
      .digest("base64url");
    return `${unsigned}.${signature}`;
  }

  private verify(token: string, expectedType: TokenType): TokenPayload {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw this.invalidToken();
    }
    const header = parts[0]!;
    const payload = parts[1]!;
    const providedSignature = parts[2]!;
    const expectedSignature = createHmac(
      "sha256",
      expectedType === "access"
        ? process.env.JWT_ACCESS_SECRET!
        : process.env.JWT_REFRESH_SECRET!,
    )
      .update(`${header}.${payload}`)
      .digest("base64url");
    const actual = Buffer.from(providedSignature);
    const expected = Buffer.from(expectedSignature);
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw this.invalidToken();
    }
    try {
      const decoded = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8"),
      ) as TokenPayload;
      if (
        decoded.type !== expectedType ||
        !decoded.sub ||
        decoded.exp <= Math.floor(Date.now() / 1000)
      ) {
        throw new Error("expired");
      }
      return decoded;
    } catch {
      throw this.invalidToken();
    }
  }

  private invalidToken(): UnauthorizedException {
    return new UnauthorizedException({
      code: "INVALID_TOKEN",
      message: "The authentication token is invalid or expired.",
    });
  }
}
