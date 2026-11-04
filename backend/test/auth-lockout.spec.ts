import "reflect-metadata";
import { HttpException, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../src/modules/auth/auth.service";

/**
 * Tests para el lockout por email del AuthService:
 *   - tras 5 intentos fallidos consecutivos en 15 min, el 6º no toca Supabase
 *     y responde 429.
 *   - un login exitoso limpia el contador.
 *
 * Mockeamos Redis con un Map en memoria y Supabase con un stub mínimo.
 */

interface RedisMock {
  store: Map<string, string>;
  get: (k: string) => Promise<string | null>;
  set: (k: string, v: string, ttl?: number) => Promise<void>;
  del: (k: string) => Promise<void>;
  setNx: (k: string, v: string, ttl?: number) => Promise<boolean>;
  getJson: <T>(k: string) => Promise<T | null>;
  setJson: <T>(k: string, data: T, ttl?: number) => Promise<void>;
}

function makeRedis(): RedisMock {
  const store = new Map<string, string>();
  return {
    store,
    async get(k) {
      return store.get(k) ?? null;
    },
    async set(k, v) {
      store.set(k, v);
    },
    async del(k) {
      store.delete(k);
    },
    async setNx(k, v) {
      if (store.has(k)) return false;
      store.set(k, v);
      return true;
    },
    async getJson<T>(k: string) {
      const v = store.get(k);
      return v ? (JSON.parse(v) as T) : null;
    },
    async setJson<T>(k: string, data: T) {
      store.set(k, JSON.stringify(data));
    },
  };
}

function makeAuthService(opts: {
  signInSucceeds: boolean;
  hasMfa?: boolean;
}) {
  const redis = makeRedis();

  const supabase = {
    authClient: () => ({
      auth: {
        signInWithPassword: async () => {
          if (opts.signInSucceeds) {
            return {
              data: {
                user: { id: "user-1", email: "a@b.co" },
                session: {
                  access_token: "at",
                  refresh_token: "rt",
                  expires_at: 123,
                },
              },
              error: null,
            };
          }
          return { data: {}, error: { message: "Invalid login credentials" } };
        },
      },
    }),
  } as any;

  const config = { get: () => "false" } as any; // REQUIRE_EMAIL_VERIFY
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
  const mfa = { isMfaEnabled: async () => opts.hasMfa ?? false } as any;
  const mailer = { sendPasswordRecovery: jest.fn().mockResolvedValue(true) } as any;

  const svc = new AuthService(supabase, config, redis as any, audit, mfa, mailer);
  return { svc, redis, audit, mailer };
}

describe("AuthService lockout por email", () => {
  it("bloquea el 6º intento tras 5 fallos", async () => {
    const { svc, audit } = makeAuthService({ signInSucceeds: false });

    for (let i = 0; i < 5; i++) {
      await expect(
        svc.signIn({ email: "mal@user.co", password: "x" } as any),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }

    // 6º intento: lockout. No llega a Supabase, responde 429.
    await expect(
      svc.signIn({ email: "mal@user.co", password: "x" } as any),
    ).rejects.toBeInstanceOf(HttpException);

    // El audit debe tener registrado al menos el motivo lockout
    const calls = (audit.record as jest.Mock).mock.calls;
    const hasLockout = calls.some(
      (c) => c[1] === "AUTH_LOGIN_FAIL" && c[3]?.reason === "lockout",
    );
    expect(hasLockout).toBe(true);
  });

  it("un login exitoso borra el contador de fallos", async () => {
    const { svc, redis } = makeAuthService({ signInSucceeds: true });

    // Simulamos que hubo 2 fallos previos
    await redis.set("auth:fail:a@b.co", "2");

    const res = await svc.signIn({ email: "a@b.co", password: "ok" } as any);
    expect((res as any).accessToken).toBe("at");

    // El contador debe estar borrado
    const after = await redis.get("auth:fail:a@b.co");
    expect(after).toBeNull();
  });

  it("normaliza el email (case/whitespace) en la clave de lockout", async () => {
    const { svc, redis } = makeAuthService({ signInSucceeds: false });

    await expect(
      svc.signIn({ email: "  A@B.CO  ", password: "x" } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    // La clave normalizada debe existir, no la cruda
    expect(await redis.get("auth:fail:a@b.co")).toBe("1");
    expect(await redis.get("auth:fail:  A@B.CO  ")).toBeNull();
  });
});
