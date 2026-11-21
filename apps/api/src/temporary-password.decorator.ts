import { SetMetadata } from "@nestjs/common";

export const ALLOW_TEMPORARY_PASSWORD = "allowTemporaryPassword";
export const AllowTemporaryPassword = () =>
  SetMetadata(ALLOW_TEMPORARY_PASSWORD, true);
