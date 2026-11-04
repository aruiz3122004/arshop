import "reflect-metadata";
import { AuthService } from "../src/modules/auth/auth.service";

/**
 * Los correos de recuperación de contraseña deben salir por Resend desde el
 * dominio propio, no por el mailer de Supabase Auth (que enviaba un template
 * en inglés con branding de Supabase).
 *
 * Contrato:
 *   1. Se genera el enlace con `admin.generateLink` (no envía correo) y se
 *      despacha con `AuthMailerService.sendPasswordRecovery`.
 *   2. Si `generateLink` falla (email inexistente, etc.) se cae al mailer de
 *      Supabase para no romper el flujo.
 *   3. Se mantiene la deduplicación de 60s por email.
 */

function makeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string) => {
      store.set(k, v);
    },
    del: async (k: string) => {
      store.delete(k);
    },
    setNx: async (k: string, v: string) => {
      if (store.has(k)) return false;
      store.set(k, v);
      return true;
    },
    getJson: async () => null,
    setJson: async () => undefined,
  };
}

function makeService(opts: {
  actionLink?: string | null;
  generateError?: { message: string } | null;
  resendSucceeds?: boolean;
}) {
  const redis = makeRedis();
  const resendReset = jest.fn().mockResolvedValue({ data: {}, error: null });
  const generateLink = jest.fn().mockResolvedValue({
    data:
      opts.actionLink === null
        ? { properties: {} }
        : {
            properties: {
              action_link:
                opts.actionLink ??
                "https://proj.supabase.co/auth/v1/verify?token=abc&type=recovery",
            },
          },
    error: opts.generateError ?? null,
  });

  const supabase = {
    admin: {
      auth: {
        admin: { generateLink },
        resetPasswordForEmail: resendReset,
      },
    },
  } as any;

  const config = {
    get: (key: string) =>
      key === "APP_URL" ? "https://arshop.co" : "false",
  } as any;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
  const mfa = { isMfaEnabled: async () => false } as any;
  const mailer = {
    sendPasswordRecovery: jest
      .fn()
      .mockResolvedValue(opts.resendSucceeds ?? true),
  } as any;

  const svc = new AuthService(
    supabase,
    config,
    redis as any,
    audit,
    mfa,
    mailer,
  );

  return { svc, mailer, generateLink, resendReset, redis };
}

describe("AuthService · recuperación de contraseña vía Resend", () => {
  it("genera el enlace y lo envía con Resend, sin usar el mailer de Supabase", async () => {
    const { svc, mailer, generateLink, resendReset } = makeService({});

    const res = await svc.requestPasswordReset("Cliente@ARShop.co");

    expect(res).toEqual({ ok: true });
    // generateLink recibe el email normalizado y el redirect al frontend
    expect(generateLink).toHaveBeenCalledWith({
      type: "recovery",
      email: "cliente@arshop.co",
      options: { redirectTo: "https://arshop.co/recuperar" },
    });
    expect(mailer.sendPasswordRecovery).toHaveBeenCalledWith(
      "cliente@arshop.co",
      "https://proj.supabase.co/auth/v1/verify?token=abc&type=recovery",
    );
    // No debe dispararse el correo nativo de Supabase
    expect(resendReset).not.toHaveBeenCalled();
  });

  it("cae al mailer de Supabase si no se pudo generar el enlace", async () => {
    const { svc, mailer, resendReset } = makeService({
      generateError: { message: "User not found" },
      actionLink: null,
    });

    const res = await svc.requestPasswordReset("nadie@arshop.co");

    expect(res).toEqual({ ok: true });
    expect(mailer.sendPasswordRecovery).not.toHaveBeenCalled();
    expect(resendReset).toHaveBeenCalledWith("nadie@arshop.co", {
      redirectTo: "https://arshop.co/recuperar",
    });
  });

  it("cae al mailer de Supabase si Resend rechaza el envío", async () => {
    const { svc, resendReset } = makeService({ resendSucceeds: false });

    await svc.requestPasswordReset("cliente@arshop.co");

    expect(resendReset).toHaveBeenCalledTimes(1);
  });

  it("no envía dos correos al mismo email dentro de 60s", async () => {
    const { svc, mailer } = makeService({});

    await svc.requestPasswordReset("cliente@arshop.co");
    await svc.requestPasswordReset("cliente@arshop.co");

    expect(mailer.sendPasswordRecovery).toHaveBeenCalledTimes(1);
  });

  it("siempre responde ok:true aunque el email no exista (anti-enumeración)", async () => {
    const { svc } = makeService({
      generateError: { message: "User not found" },
      actionLink: null,
    });

    await expect(
      svc.requestPasswordReset("fantasma@arshop.co"),
    ).resolves.toEqual({ ok: true });
  });
});
