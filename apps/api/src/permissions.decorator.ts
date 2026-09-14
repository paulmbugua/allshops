import { SetMetadata } from "@nestjs/common";

export const REQUIRED_PERMISSIONS = "allshops:permissions";
export const REQUIRED_ANY_PERMISSIONS = "allshops:any-permissions";
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);
export const RequireAnyPermission = (...permissions: string[]) =>
  SetMetadata(REQUIRED_ANY_PERMISSIONS, permissions);
