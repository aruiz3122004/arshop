import type { Role } from "../decorators/roles.decorator";

/**
 * Perfil completo tal como vive en `public.profiles`. Lo pre-carga el
 * `SupabaseAuthGuard` para evitar que cada controller tenga que hacer su
 * propio SELECT (shaves ~50-100ms por request autenticado).
 */
export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  document_type: string | null;
  document_number: string | null;
  role: Role;
  blocked: boolean;
  created_at: string;
}

export interface AuthenticatedUser {
  id: string; // auth.users.id (uuid)
  email: string | null;
  role: Role;
  blocked: boolean;
  /** Perfil completo precargado por el guard. */
  profile: UserProfile;
}

export interface RequestWithUser extends Express.Request {
  user?: AuthenticatedUser;
}
