import { SetMetadata } from "@nestjs/common";

export type Role = "CUSTOMER" | "ADMIN" | "REPARTIDOR";
export const ROLES_KEY = "roles";
/** Restringe el acceso a usuarios con alguno de los roles indicados. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
