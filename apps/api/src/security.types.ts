export interface AuthenticatedUser {
  id: string;
  email: string;
  isPlatformAdmin: boolean;
}

export interface TenantContext {
  organizationId: string;
  membershipId: string;
  roleId: string;
  roleCode: string;
  branchId: string | null;
  permissions: string[];
}

export interface RequestContext {
  headers: Record<string, string | string[] | undefined>;
  params?: Record<string, string | undefined>;
  method?: string;
  originalUrl?: string;
  route?: { path?: string };
  ip?: string;
  socket?: { remoteAddress?: string };
  user?: AuthenticatedUser;
  tenant?: TenantContext;
  requestId?: string;
  body?: Record<string, unknown>;
}

export interface ResponseContext {
  statusCode: number;
  getHeader(name: string): number | string | string[] | undefined;
  setHeader(name: string, value: string | readonly string[]): void;
  status(code: number): ResponseContext;
  json(body: unknown): void;
  on?(event: string, listener: () => void): void;
  setTimeout?(milliseconds: number, callback?: () => void): void;
}
