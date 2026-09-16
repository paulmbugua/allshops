"use client";
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

/**
 * Product images are persisted as absolute API URLs. Older local uploads can
 * therefore contain localhost even after the web app is deployed elsewhere.
 * Repoint only those legacy local origins to the current configured API while
 * leaving every normal HTTPS asset untouched.
 */
export function resolveApiAssetUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value, typeof window === "undefined" ? "http://localhost" : window.location.origin);
    if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") return value;
    const configured = new URL(API_URL, typeof window === "undefined" ? "http://localhost" : window.location.origin);
    return `${configured.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return value;
  }
}
export interface Membership {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationStatus: string;
  roleId: string;
  role: string;
  roleName: string;
  permissions: string[];
  branchId: string | null;
  branchName: string | null;
  employeeNumber: string;
  status: string;
}
export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  emailVerifiedAt: string | null;
  status: string;
  memberships: Membership[];
}
export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  user: CurrentUser;
  activationRequired?: boolean;
  activationToken?: string;
  emailDelivery?: "SENT" | "FAILED" | "NOT_CONFIGURED";
}
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}
export function setAccessToken(token: string): void {
  sessionStorage.setItem("allshops_access", token);
}
export function clearSession(): void {
  sessionStorage.removeItem("allshops_access");
}
export function selectedOrganization(): string | null {
  return typeof window === "undefined"
    ? null
    : sessionStorage.getItem("allshops_organization");
}
export function selectOrganization(id: string): void {
  sessionStorage.setItem("allshops_organization", id);
  localStorage.setItem("allshops_last_organization", id);
}
export async function api<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const token = sessionStorage.getItem("allshops_access");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (response.status === 401 && retry && path !== "/auth/refresh") {
    const refreshed = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (refreshed.ok) {
      const session = (await refreshed.json()) as AuthResult;
      setAccessToken(session.accessToken);
      return api<T>(path, init, false);
    }
  }
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw new ApiError(
      typeof payload.message === "string" ? payload.message : "Request failed.",
      response.status,
      typeof payload.code === "string" ? payload.code : "ERROR",
    );
  }
  return payload as T;
}
