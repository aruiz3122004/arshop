import { SetMetadata } from "@nestjs/common";

export const IS_OPTIONAL_AUTH_KEY = "isOptionalAuth";

/**
 * Ruta que funciona con o sin sesión.
 *
 * - Sin cookie/token: el guard deja pasar y `req.user` queda undefined.
 * - Con token válido: el guard valida normalmente y popula `req.user`.
 * - Con token inválido: rechaza (no degrada silenciosamente a invitado).
 *
 * Se usa en guest checkout para que un usuario logueado no termine creando
 * una orden como invitado sólo porque la ruta es pública.
 */
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);
