import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import * as jwt from "jsonwebtoken";
import { SupabaseService } from "../../supabase/supabase.service";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import type { AuthenticatedUser, UserProfile } from "../types/user";
import type { Role } from "../decorators/roles.decorator";

/**
 * Payload de un JWT de Supabase (campos relevantes). `aud` vale
 * "authenticated" para usuarios reales — otros valores (p.ej. "anon") son
 * tokens sin usuario y los rechazamos.
 */
interface SupabaseJwtPayload extends jwt.JwtPayload {
  sub: string;
  email?: string;
  aud: string;
}

const PROFILE_COLUMNS =
  "id, email, full_name, phone, document_type, document_number, role, blocked, created_at";

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);
  private readonly jwtSecret: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly supabase: SupabaseService,
    config: ConfigService,
  ) {
    this.jwtSecret = config.getOrThrow<string>("SUPABASE_JWT_SECRET");
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      cookies?: Record<string, string | undefined>;
      user?: AuthenticatedUser;
      accessToken?: string;
    }>();

    // Prioriza cookie httpOnly (nuevo flujo) y cae al Bearer header para
    // compatibilidad con clientes que todavía mandan el token manualmente.
    const token =
      req.cookies?.arshop_access_token ||
      extractBearer(req.headers.authorization);
    if (!token) throw new UnauthorizedException("Missing bearer token");

    // Validación local del JWT con el secret del proyecto Supabase. Antes
    // se usaba supabase.auth.getUser(token), un roundtrip HTTP de 150-300ms.
    // jwt.verify es síncrono y <1ms. Trade-off: si el user hizo signOut en
    // Supabase, el access_token sigue siendo válido hasta su exp (1h). El
    // frontend borra las cookies al logout, así que un atacante necesitaría
    // haber capturado el token antes.
    //
    // Fallback: si la verificación local falla por una razón que NO sea
    // expiración (p. ej. Supabase migró a claves asimétricas y nuestro
    // secret ya no coincide con la firma HS256), caemos al endpoint remoto
    // de Supabase. Perdemos la ganancia de latencia en ese caso pero el
    // login nunca se bloquea por un mismatch de firma.
    let payload: SupabaseJwtPayload | null = null;
    try {
      payload = jwt.verify(token, this.jwtSecret, {
        algorithms: ["HS256"],
      }) as SupabaseJwtPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException("Token expirado");
      }
      // Cualquier otro error (malformed, invalid signature, invalid alg):
      // intentamos el camino remoto antes de rechazar.
      this.logger.warn(
        `jwt.verify local falló (${err instanceof Error ? err.message : "unknown"}), probando remoto`,
      );
      const { data, error } = await this.supabase.admin.auth.getUser(token);
      if (error || !data.user) {
        throw new UnauthorizedException("Invalid or expired token");
      }
      payload = {
        sub: data.user.id,
        email: data.user.email,
        aud: "authenticated",
      } as SupabaseJwtPayload;
    }

    if (payload.aud !== "authenticated" || !payload.sub) {
      throw new UnauthorizedException("Token sin usuario asociado");
    }

    // Un solo SELECT trae role, blocked y el resto del perfil que los
    // controllers de /users/me y admin van a consumir — evita un segundo
    // viaje a la DB desde el controller.
    const { data: profile, error } = await this.supabase.admin
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", payload.sub)
      .maybeSingle();

    if (error) {
      this.logger.error(`profiles SELECT falló: ${error.message}`);
      throw new UnauthorizedException("No se pudo verificar el perfil");
    }

    // Si todavía no existe la fila (user recién creado antes de que
    // dispare el trigger de profiles), dejamos un stub con defaults
    // seguros. El controller de /users/me se encarga de persistirlo.
    const resolvedProfile: UserProfile = (profile as UserProfile | null) ?? {
      id: payload.sub,
      email: payload.email ?? null,
      full_name: null,
      phone: null,
      document_type: null,
      document_number: null,
      role: "CUSTOMER" as Role,
      blocked: false,
      created_at: new Date(0).toISOString(),
    };

    if (resolvedProfile.blocked) {
      throw new ForbiddenException("Account is blocked");
    }

    req.user = {
      id: payload.sub,
      email: payload.email ?? resolvedProfile.email ?? null,
      role: resolvedProfile.role,
      blocked: resolvedProfile.blocked,
      profile: resolvedProfile,
    };
    req.accessToken = token;
    return true;
  }
}

function extractBearer(h: string | string[] | undefined): string | null {
  if (!h) return null;
  const v = Array.isArray(h) ? h[0] : h;
  const m = /^Bearer\s+(.+)$/i.exec(v.trim());
  return m ? m[1] : null;
}
