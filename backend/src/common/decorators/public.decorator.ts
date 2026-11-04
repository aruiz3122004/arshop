import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";
/** Marca una ruta como pública (SupabaseAuthGuard la deja pasar sin JWT). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
