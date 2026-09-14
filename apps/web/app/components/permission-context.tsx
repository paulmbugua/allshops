"use client";

import { createContext, useContext, type ReactNode } from "react";

const PermissionContext = createContext<ReadonlySet<string>>(new Set());

export function PermissionProvider({
  permissions,
  children,
}: {
  permissions: string[];
  children: ReactNode;
}) {
  return (
    <PermissionContext.Provider value={new Set(permissions)}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissions() {
  const permissions = useContext(PermissionContext);
  return {
    can: (...required: string[]) =>
      required.every((permission) => permissions.has(permission)),
    any: (...required: string[]) =>
      required.some((permission) => permissions.has(permission)),
    permissions,
  };
}

export function Can({
  permissions: required,
  any = false,
  children,
  fallback = null,
}: {
  permissions: string[];
  any?: boolean;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const permissions = useContext(PermissionContext);
  const allowed = any
    ? required.some((permission) => permissions.has(permission))
    : required.every((permission) => permissions.has(permission));
  return allowed ? children : fallback;
}
