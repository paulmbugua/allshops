import type { RequestContext, ResponseContext } from "./security.types.js";

export const REFRESH_COOKIE = "allshops_refresh";

export function readCookie(
  request: RequestContext,
  name: string,
): string | undefined {
  const raw = request.headers.cookie;
  const header = Array.isArray(raw) ? raw[0] : raw;
  return header
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === name)
    ?.slice(1)
    .join("=");
}

export function setRefreshCookie(
  response: ResponseContext,
  token: string,
  maxAgeSeconds: number,
): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${REFRESH_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Max-Age=${maxAgeSeconds}${secure}`,
  );
}

export function clearRefreshCookie(response: ResponseContext): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${REFRESH_COOKIE}=; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Max-Age=0${secure}`,
  );
}
