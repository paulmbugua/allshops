import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC = "allshops:is-public";
export const Public = () => SetMetadata(IS_PUBLIC, true);
