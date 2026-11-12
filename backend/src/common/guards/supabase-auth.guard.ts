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
import * as crypto from "crypto";
import * as jwt from "jsonwebtoken";
import type { Response } from "express";
import { SupabaseService } from "../../supabase/supabase.service";
import { AuthService } from "../../modules/auth/auth.service";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  setAuthCookies,
} from "../../modules/auth/auth-cookies";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { IS_OPTIONAL_AUTH_KEY } from "../decorators/optional-auth.decorator";
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
  private readonly supabaseUrl: string;
  private readonly anonKey: string;
  private readonly jwksCache = new Map<string, crypto.KeyObject>();
  private jwksFetchPromise: Promise<void> | null = null;

  constructor(
    private readonly reflector: Reflector,
    private readonly supabase: SupabaseService,
    config: ConfigService,
    private readonly authService?: AuthService,
  ) {
    this.jwtSecret = config.getOrThrow<string>("SUPABASE_JWT_SECRET");
    this.supabaseUrl = config.getOrThrow<string>("SUPABASE_URL");
    this.anonKey = config.getOrThrow<string>("SUPABASE_ANON_KEY");
  }

  private async ensureJwksLoaded(kid?: string): Promise<crypto.KeyObject | null> {
    if (kid && this.jwksCache.has(kid)) {
      return this.jwksCache.get(kid)!;
    }
    if (!this.jwksFetchPromise) {
      this.jwksFetchPromise = (async () => {
        try {
          const res = await fetch(
            `${this.supabaseUrl.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`,
            { headers: { apikey: this.anonKey } },
          );
          if (!res.ok) return;
          const body = (await res.json()) as {
            keys?: Array<crypto.JsonWebKey & { kid?: string }>;
          };
          for (const jwk of body.keys ?? []) {
            if (jwk.kid) {
              const pubKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
              this.jwksCache.set(jwk.kid, pubKey);
            }
          }
        } catch (err: any) {
          this.logger.warn(`No se pudo cargar JWKS de Supabase: ${err?.message ?? err}`);
        } finally {
          this.jwksFetchPromise = null;
        }
      })();
    }
    await this.jwksFetchPromise;
    if (kid) return this.jwksCache.get(kid) ?? null;
    const first = this.jwksCache.values().next();
    return first.done ? null : first.value;
  }

  private async verifyTokenLocal(token: string): Promise<SupabaseJwtPayload> {
    const decoded = jwt.decode(token, { complete: true });
    const alg = decoded?.header?.alg;
    const kid = decoded?.header?.kid;

    if (alg === "ES256") {
      const pubKey = await this.ensureJwksLoaded(kid);
      if (pubKey) {
        return jwt.verify(token, pubKey, {
          algorithms: ["ES256"],
        }) as SupabaseJwtPayload;
      }
    }

    return jwt.verify(token, this.jwtSecret, {
      algorithms: ["HS256"],
    }) as SupabaseJwtPayload;
  }

  private async tryTransparentRefresh(
    refreshToken: string | undefined,
    res: Response,
  ): Promise<string | null> {
    const clean = (refreshToken ?? "").trim();
    if (!this.authService || !clean || clean === "undefined" || clean === "null") {
      return null;
    }
    try {
      const refreshed = await this.authService.refresh(clean);
      setAuthCookies(res, {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
      });
      return refreshed.accessToken;
    } catch {
      return null;
    }
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(
      IS_OPTIONAL_AUTH_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );

    const http = ctx.switchToHttp();
    const req = http.getRequest<{
      headers: Record<string, string | string[] | undefined>;
      cookies?: Record<string, string | undefined>;
      user?: AuthenticatedUser;
      accessToken?: string;
    }>();
    const res = http.getResponse<Response>();

    // Prioriza cookie httpOnly (nuevo flujo) y cae al Bearer header para
    // compatibilidad con clientes que todavía mandan el token manualmente.
    const rawCookieToken = req.cookies?.[ACCESS_COOKIE];
    let token =
      (rawCookieToken && rawCookieToken !== "undefined" ? rawCookieToken : null) ||
      extractBearer(req.headers.authorization);

    // Si el access_token ya expiró en cookie (1h) pero existe refresh_token (30d),
    // renovamos transparentemente en servidor sin devolver 401 al cliente.
    if (!token && req.cookies?.[REFRESH_COOKIE]) {
      token = await this.tryTransparentRefresh(req.cookies[REFRESH_COOKIE], res);
    }

    if (!token) {
      if (isOptionalAuth) return true;
      throw new UnauthorizedException("Missing bearer token");
    }

    let payload: SupabaseJwtPayload | null = null;
    try {
      payload = await this.verifyTokenLocal(token);
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        const refreshedToken = await this.tryTransparentRefresh(
          req.cookies?.[REFRESH_COOKIE],
          res,
        );
        if (refreshedToken) {
          token = refreshedToken;
          payload = await this.verifyTokenLocal(token);
        } else {
          if (isOptionalAuth) return true;
          throw new UnauthorizedException("Token expirado");
        }
      } else {
        // Cualquier otro error (malformed, invalid signature, invalid alg):
        // intentamos el camino remoto antes de rechazar.
        this.logger.warn(
          `jwt.verify local falló (${err instanceof Error ? err.message : "unknown"}), probando remoto`,
        );
        const { data, error } = await this.supabase.admin.auth.getUser(token);
        if (error || !data.user) {
          const refreshedToken = await this.tryTransparentRefresh(
            req.cookies?.[REFRESH_COOKIE],
            res,
          );
          if (refreshedToken) {
            token = refreshedToken;
            payload = await this.verifyTokenLocal(token);
          } else {
            if (isOptionalAuth) return true;
            throw new UnauthorizedException("Invalid or expired token");
          }
        } else {
          payload = {
            sub: data.user.id,
            email: data.user.email,
            aud: "authenticated",
          } as SupabaseJwtPayload;
        }
      }
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
