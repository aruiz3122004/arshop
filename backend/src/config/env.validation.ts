import { z } from "zod";

/**
 * Valor por defecto que SÓLO sirve en desarrollo. En producción el schema
 * rechaza este valor para que el backend se niegue a arrancar si el env
 * real no se configuró.
 */
const DEV_QR_HMAC_DEFAULT =
  "dev_qr_hmac_change_me_in_production_min_32_chars";

/**
 * Esquema de variables de entorno. Fail-fast en el bootstrap si falta
 * algo crítico, para no arrancar con configuración silenciosamente rota.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1),

  // Stripe
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_CURRENCY: z.string().default("cop"),

  // Resend
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM: z.string().min(1),
  // Si está definido, todos los correos salientes se redirigen a este email
  // (modo sandbox, para no spamear clientes mientras no hay dominio verificado).
  RESEND_SANDBOX_TO: z
    .string()
    .email()
    .optional()
    .or(z.literal("").transform(() => undefined)),

  // Redis
  REDIS_HOST: z
    .string()
    .default("localhost")
    .transform((val) =>
      val
        .replace(/^https?:\/\//i, "")
        .replace(/^rediss?:\/\//i, "")
        .replace(/\/+$/, "")
        .trim(),
    ),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  // Habilita TLS (rediss://). Managed Redis como Upstash lo requiere.
  REDIS_TLS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // Throttling
  THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT_DEFAULT: z.coerce.number().int().positive().default(120),
  THROTTLE_LIMIT_STRICT: z.coerce.number().int().positive().default(5),

  // ElasticSearch (opcional — si no se define, corre en motor full-text aislado en memoria)
  ELASTICSEARCH_NODE: z.string().optional(),
  ELASTICSEARCH_INDEX: z.string().default("arshop_products"),
  ELASTICSEARCH_API_KEY: z.string().optional(),
  ELASTICSEARCH_USERNAME: z.string().optional(),
  ELASTICSEARCH_PASSWORD: z.string().optional(),

  // Delivery (domiciliarios)
  QR_HMAC_SECRET: z.string().min(32).default(DEV_QR_HMAC_DEFAULT),
  DELIVERY_BONUS_BASE_COP: z.coerce.number().int().positive().default(30000),
  DELIVERY_FREE_RADIUS_KM: z.coerce.number().positive().default(15),
  QR_TTL_SECONDS: z.coerce.number().int().positive().default(172800), // 48h
  CLIENT_CODE_TTL_SECONDS: z.coerce.number().int().positive().default(120), // 2 min
  SIMULATED_DELIVERY_HOURS: z.coerce.number().int().positive().default(48),
  // Hito intermedio: recordatorio al cliente antes de que venza la ventana.
  // Debe ser menor que SIMULATED_DELIVERY_HOURS.
  SIMULATED_DELIVERY_REMINDER_HOURS: z.coerce.number().int().positive().default(24),

  // Firma de los enlaces públicos de facturas. Si se omite se reutiliza
  // QR_HMAC_SECRET (ya obligatorio en producción). Definirlo permite rotar
  // los enlaces de facturas sin invalidar los QR de entrega.
  INVOICE_PUBLIC_SECRET: z
    .string()
    .min(32)
    .optional()
    .or(z.literal("").transform(() => undefined)),

  // Web Push (VAPID). Si falta cualquiera, el push queda deshabilitado — no bloquea el arranque.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),

  // URL del frontend para construir links en los correos
  APP_URL: z.string().default("http://localhost:3000"),

  // Firma de los enlaces de seguimiento de pedidos de invitado. Si se omite
  // se reutiliza QR_HMAC_SECRET. Definirlo permite rotar links de invitado
  // sin invalidar los QR de entrega.
  GUEST_ORDER_SECRET: z
    .string()
    .min(32)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  GUEST_ORDER_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 30),

  // Token one-shot para promover admin
  ADMIN_SETUP_TOKEN: z.string().optional(),

  // Política de verificación de email
  REQUIRE_EMAIL_VERIFY: z.enum(["true", "false"]).default("false"),

  // Modo demo del backend (endpoint /auth/demo-sign-in con cuentas fijas y
  // contraseña conocida). **Fail-closed**: si la variable falta se asume
  // deshabilitado. El sandbox del frontend (demo-store.ts) corre en el
  // navegador y NO depende de esto, así que apagarlo no rompe la demo.
  DEMO_MODE_DISABLED: z.enum(["true", "false"]).default("true"),
})
.superRefine((env, ctx) => {
  if (env.NODE_ENV === "production" && env.DEMO_MODE_DISABLED !== "true") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DEMO_MODE_DISABLED"],
      message:
        "El modo demo está habilitado en producción: /auth/demo-sign-in permite iniciar sesión como ADMIN con credenciales del repositorio. Define DEMO_MODE_DISABLED=true.",
    });
  }
  // En producción no permitimos el valor dev de QR_HMAC_SECRET — si el
  // deploy olvidó setear el env real, los QR y códigos de 4 dígitos de todos
  // los pedidos serían falsificables por cualquiera que conozca esa cadena
  // (presente en el repo). Falla rápido.
  if (env.NODE_ENV === "production" && env.QR_HMAC_SECRET === DEV_QR_HMAC_DEFAULT) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["QR_HMAC_SECRET"],
      message:
        "QR_HMAC_SECRET usa el default de desarrollo. Define un secret aleatorio (>= 32 chars) antes de desplegar.",
    });
  }
});

export type Env = z.infer<typeof envSchema>;

export function validate(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors;
    throw new Error(
      `Invalid environment variables:\n${JSON.stringify(details, null, 2)}`,
    );
  }
  return parsed.data;
}
