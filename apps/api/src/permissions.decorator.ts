import { SetMetadata } from "@nestjs/common";

export const REQUIRED_PERMISSIONS = "allshops:permissions";
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);
