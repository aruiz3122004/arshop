import {
  type CategorySlug,
  type Gender,
  type Product,
  type ProductVariant,
} from "./catalog";
import {
  clearDemoSession,
  handleDemoApiRequest,
  isDemoActive,
  startDemoSession,
} from "./demo-store";

/**
 * URL base del API.
 *
 * - En el **browser** usamos la ruta relativa `/api`. Next.js reescribe esa
 *   ruta hacia la URL real del backend (BACKEND_URL). Al ser same-origin,
 *   las cookies httpOnly viajan sin fricción cross-site.
 * - En **SSR** no hay rewrites del lado del server, así que apuntamos directo
 *   al backend. El SSR no necesita cookies (son peticiones no autenticadas
 *   para catálogo/producto).
 */
export const API_BASE_URL =
  typeof window === "undefined"
    ? process.env.BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_URL_RAW ||
      "http://localhost:4000"
    : "/api";

export interface ApiProductVariant {
  id: string;
  sku: string;
  size: string;
  stock: number;
  color_name: string;
  color_hex: string;
}

export interface ApiProduct {
  id: string;
  slug: string;
  name: string;
  brand: string;
  description: string;
  gender: Gender;
  category: string;
  price_cop: number;
  currency: "COP";
  images: string[];
  active: boolean;
  created_at: string;
  variants?: ApiProductVariant[];
  compare_at_price_cop?: number | null;
  fit?: "slim" | "regular" | "relaxed" | "oversize" | null;
  size_guide?: Record<string, any> | null;
  drop_starts_at?: string | null;
  drop_ends_at?: string | null;
}

export interface ListProductsParams {
  gender?: Gender;
  category?: CategorySlug;
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
  cursor?: string;
}

/**
 * Convierte el modelo de datos de la API de NestJS al formato unificado de ARShop.
 * Preserva tallas, colores ordenados y añade las variantes reales con ID/SKU.
 */
export function mapApiProductToProduct(api: ApiProduct): Product {
  const variants: ProductVariant[] = (api.variants ?? []).map((v) => ({
    id: v.id,
    sku: v.sku,
    size: v.size,
    stock: v.stock,
    color_name: v.color_name,
    color_hex: v.color_hex,
  }));

  // Extraer tallas únicas preservando orden de aparición
  const sizeSet = new Set<string>();
  const sizes: string[] = [];
  for (const v of variants) {
    if (v.size && !sizeSet.has(v.size)) {
      sizeSet.add(v.size);
      sizes.push(v.size);
    }
  }

  // Extraer colores únicos
  const colorMap = new Map<string, { name: string; hex: string }>();
  for (const v of variants) {
    if (v.color_name && !colorMap.has(v.color_name)) {
      colorMap.set(v.color_name, {
        name: v.color_name,
        hex: v.color_hex || "#111111",
      });
    }
  }
  const colors = Array.from(colorMap.values());

  return {
    id: api.id,
    slug: api.slug,
    name: api.name,
    brand: api.brand,
    price: api.price_cop,
    currency: api.currency || "COP",
    gender: api.gender,
    category: api.category as CategorySlug,
    images: api.images && api.images.length > 0 ? api.images : [],
    colors: colors.length > 0 ? colors : [{ name: "Único", hex: "#111111" }],
    sizes: sizes.length > 0 ? sizes : ["Única"],
    description: api.description,
    compareAtPrice: api.compare_at_price_cop ?? null,
    fit: api.fit ?? "regular",
    sizeGuide: api.size_guide ?? null,
    variants,
  };
}

/**
 * Promise compartida del refresh en curso: dedup entre tabs/requests
 * concurrentes. Si cinco llamadas disparan 401 a la vez, solo una pega al
 * backend; las otras cuatro esperan el mismo resultado. Sin esto, el
 * refresh race-condition puede dejar las cookies en un estado intermedio
 * y hacer que algunas peticiones vean sesión expirada aunque el refresh
 * haya funcionado para otras.
 */
let refreshInFlight: Promise<boolean> | null = null;

function refreshSessionOnce(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: "{}",
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      // Liberar sin bloquear el microtask queue del await actual
      queueMicrotask(() => {
        refreshInFlight = null;
      });
    }
  })();
  return refreshInFlight;
}

/**
 * Cliente HTTP base para la API de NestJS.
 *
 * Autenticación: las cookies httpOnly `arshop_access_token` + `arshop_refresh_token`
 * se envían automáticamente gracias a `credentials: "include"`. El cliente ya
 * NO lee ni escribe tokens en localStorage.
 *
 * En 401, se intenta refrescar la sesión llamando a /auth/refresh (que lee el
 * refresh desde cookie y setea una nueva pareja), y se reintenta la petición.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (typeof window !== "undefined" && isDemoActive()) {
    const intercepted = handleDemoApiRequest<T>(path, options);
    if (intercepted !== undefined) {
      return intercepted;
    }
  }

  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;

  // Sólo seteamos Content-Type cuando mandamos body JSON. Un GET sin body
  // con Content-Type: application/json forzaba preflight CORS innecesario
  // y rompía el cache de Next para rutas revalidables.
  const inputHeaders = (options.headers as Record<string, string>) ?? {};
  const headers: Record<string, string> = { ...inputHeaders };
  if (options.body != null && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await (async () => {
    try {
      return await fetch(url, {
        ...options,
        headers,
        credentials: "include",
      });
    } catch {
      // fetch sólo rechaza por fallas de red (offline, DNS, backend caído en
      // llamadas server-side). `status: 0` = "no hubo respuesta HTTP".
      throw Object.assign(
        new Error(
          "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.",
        ),
        { status: 0, isNetworkError: true },
      );
    }
  })();

  if (!response.ok) {
    if (
      response.status === 401 &&
      !(options as { _retry?: boolean })._retry &&
      !path.startsWith("/auth/")
    ) {
      const refreshed = await refreshSessionOnce();
      if (refreshed) {
        return apiFetch<T>(path, {
          ...options,
          _retry: true,
        } as RequestInit & { _retry?: boolean });
      }
    }

    let errMessage = `Error HTTP ${response.status}`;
    let parsed = false;
    try {
      const data = await response.json();
      parsed = true;
      if (data && data.message) {
        errMessage = Array.isArray(data.message)
          ? data.message.join(", ")
          : data.message;
      }
    } catch {}
    // Cuando el backend no responde (ECONNREFUSED, deploy caído, cold start
    // agotado), el proxy devuelve HTML/texto en vez del JSON de Nest: no
    // mostremos un "Error HTTP 500" pelado que no le dice nada al usuario.
    if (!parsed && response.status >= 500) {
      errMessage =
        "El servidor no está disponible en este momento. Intenta de nuevo en unos segundos.";
    }
    // Adjuntamos el status para que los callers puedan distinguir "sin sesión"
    // (401/403) de un fallo transitorio (500, cold start, red caída).
    throw Object.assign(new Error(errMessage), { status: response.status });
  }

  return response.json();
}

/**
 * Obtiene la lista de productos desde NestJS API.
 */
export async function fetchProducts(
  params: ListProductsParams = {},
): Promise<Product[]> {
  const query = new URLSearchParams();
  if (params.gender) query.set("gender", params.gender);
  if (params.category) query.set("category", params.category);
  if (params.q) query.set("q", params.q);
  if (params.minPrice !== undefined) query.set("minPrice", String(params.minPrice));
  if (params.maxPrice !== undefined) query.set("maxPrice", String(params.maxPrice));
  query.set("limit", String(params.limit ?? 60));
  if (params.cursor) query.set("cursor", params.cursor);

  const url = `${API_BASE_URL}/products?${query.toString()}`;
  const res = await fetchWithRetry(url, { next: { revalidate: 30 } });

  if (!res.ok) {
    throw new Error(`API products returned ${res.status}`);
  }

  const data: ApiProduct[] = await res.json();
  return data.map(mapApiProductToProduct);
}

/**
 * Obtiene el detalle de un producto por su slug desde NestJS API.
 */
export async function fetchProductBySlug(
  slug: string,
): Promise<Product | null> {
  const url = `${API_BASE_URL}/products/${slug}`;
  const res = await fetchWithRetry(url, { next: { revalidate: 30 } });

  if (res.status === 404) return null;

  if (!res.ok) {
    throw new Error(`API product detail returned ${res.status}`);
  }

  const data: ApiProduct = await res.json();
  return mapApiProductToProduct(data);
}

export interface ProductAvailability {
  dropStartsAt: string | null;
  dropEndsAt: string | null;
  variants: Array<{
    id: string;
    physical_stock: number;
    available_stock: number;
  }>;
  asOf: string;
}

/** Stock disponible real por variante — para "quedan N" en PDP. */
export async function fetchProductAvailability(
  slug: string,
): Promise<ProductAvailability | null> {
  const url = `${API_BASE_URL}/products/${slug}/availability`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

/** Suscribe al usuario autenticado para recibir aviso de reposición. */
export async function apiNotifyMeBackInStock(variantId: string): Promise<void> {
  await apiFetch("/inventory/notify-me", {
    method: "POST",
    body: JSON.stringify({ variantId }),
  });
}

export async function apiCancelNotifyBackInStock(
  variantId: string,
): Promise<void> {
  await apiFetch(`/inventory/notify-me/${encodeURIComponent(variantId)}`, {
    method: "DELETE",
  });
}

/**
 * GET con un reintento ante 5xx. El rewrite `/api/*` de Next dev (Turbopack)
 * devuelve 500 esporádicamente en cold start aunque el backend esté sano;
 * el reintento absorbe ese flake sin afectar el camino caliente.
 *
 * En producción NO reintentamos: si el backend devuelve 5xx real, duplicar
 * la carga empeora el incidente. El fallo debe propagarse al cliente y a
 * Sentry/logs para que oncall lo vea.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit & { next?: { revalidate?: number } },
): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status < 500) return res;
  if (process.env.NODE_ENV === "production") return res;
  await new Promise((r) => setTimeout(r, 300));
  return fetch(url, init);
}

/* ───────────────────────── Autenticación & Usuarios ───────────────────────── */

export type DocumentType = "CC" | "CE" | "PP" | "NIT";
export type AddressLabel = "casa" | "oficina" | "otro";

/** Payload que viaja al backend al crear/editar una dirección. */
export interface ShippingAddress {
  label?: AddressLabel;
  recipientName?: string;
  line1: string;
  line2?: string;
  neighborhood: string;
  city: string;
  department: string;
  postalCode?: string;
  country?: string;
  phone: string;
  notes?: string;
  isDefault?: boolean;
}

/** Dirección tal como la devuelve el backend (incluye id y flags server-side). */
export interface Address extends ShippingAddress {
  id: string;
  isDefault: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string | null;
  phone?: string | null;
  document_type?: DocumentType | null;
  document_number?: string | null;
  role: "CUSTOMER" | "ADMIN" | "REPARTIDOR";
  blocked: boolean;
  created_at: string;
  shippingAddress?: Address | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: { id: string; email: string };
}

export interface OrderItem {
  id: string;
  variant_id: string;
  product_name: string;
  size: string;
  color_name: string;
  unit_price_cop: number;
  quantity: number;
  line_total_cop: number;
}

export interface Order {
  id: string;
  status: "PENDING_PAYMENT" | "PAID" | "SHIPPED" | "DELIVERED" | "CANCELLED";
  total_cop: number;
  shipping_cost_cop: number;
  currency: "COP";
  items: OrderItem[];
  created_at: string;
  shipping_address?: Record<string, string>;
}

export async function apiSignIn(
  email: string,
  password: string,
): Promise<AuthResponse> {
  // El backend setea cookies httpOnly con los tokens.
  // El body se mantiene por si algún cliente antiguo lo lee, pero el nuevo
  // flujo no toca localStorage.
  const data = await apiFetch<AuthResponse>("/auth/sign-in", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  cleanupLegacyTokens();
  return data;
}

/**
 * Limpia tokens de JWT que pudieran haber quedado en localStorage de
 * sesiones anteriores (cuando el flujo era localStorage-based). No afecta
 * las cookies httpOnly.
 */
function cleanupLegacyTokens() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("arshop:access_token");
    localStorage.removeItem("arshop:refresh_token");
  } catch {}
}

export async function apiSignUp(
  email: string,
  password: string,
  fullName?: string,
): Promise<{
  id?: string;
  email?: string;
  requiresEmailVerification?: boolean;
  emailSent?: boolean;
}> {
  return apiFetch<{
    id?: string;
    email?: string;
    requiresEmailVerification?: boolean;
    emailSent?: boolean;
  }>("/auth/sign-up", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      fullName: fullName?.trim() || undefined,
    }),
  });
}

export async function apiResendVerification(
  email: string,
  password: string,
): Promise<{ ok: true; alreadyConfirmed: boolean }> {
  return apiFetch<{ ok: true; alreadyConfirmed: boolean }>(
    "/auth/resend-verification",
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
    },
  );
}

/** Confirma la cuenta con el código de 6-8 caracteres del correo. */
export async function apiVerifyEmail(
  email: string,
  code: string,
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: { id: string; email: string };
}> {
  return apiFetch("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export async function apiRequestPasswordReset(
  email: string,
): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/auth/request-reset", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function apiUpdatePassword(
  accessToken: string,
  newPassword: string,
): Promise<{ ok: true; email?: string }> {
  return apiFetch<{ ok: true; email?: string }>("/auth/update-password", {
    method: "POST",
    body: JSON.stringify({ accessToken, newPassword }),
  });
}

export async function apiCompleteMfa(
  sessionId: string,
  code: string,
  method: "totp" | "email" | "backup",
): Promise<{ accessToken: string; refreshToken: string; expiresAt: number; user: { id: string; email: string } }> {
  return apiFetch<any>("/auth/complete-mfa", {
    method: "POST",
    body: JSON.stringify({ sessionId, code, method }),
  });
}

/** Genera o regenera 8 backup codes. Devuelve los códigos en claro UNA sola vez. */
export async function apiMfaGenerateBackupCodes(): Promise<{ codes: string[] }> {
  return apiFetch<{ codes: string[] }>("/auth/mfa/backup-codes/generate", {
    method: "POST",
  });
}

/** Cuántos backup codes le quedan al usuario. */
export async function apiMfaBackupCodesCount(): Promise<{ count: number }> {
  return apiFetch<{ count: number }>("/auth/mfa/backup-codes/count");
}

export async function apiSendMfaEmail(sessionId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/auth/mfa/email/send", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}

export async function apiSignOut(): Promise<void> {
  if (typeof window !== "undefined" && isDemoActive()) {
    clearDemoSession();
    cleanupLegacyTokens();
    return;
  }
  try {
    await apiFetch("/auth/sign-out", { method: "POST" });
  } catch {}
  cleanupLegacyTokens();
}

export async function apiGetMe(): Promise<UserProfile> {
  return apiFetch<UserProfile>("/users/me");
}

export async function apiUpdateMe(dto: {
  fullName?: string;
  phone?: string;
  documentType?: DocumentType;
  documentNumber?: string;
}): Promise<UserProfile> {
  return apiFetch<UserProfile>("/users/me", {
    method: "PATCH",
    body: JSON.stringify(dto),
  });
}

export async function apiGetShippingAddress(): Promise<Address | null> {
  return apiFetch<Address | null>("/users/me/shipping-address");
}

export async function apiSaveShippingAddress(
  address: ShippingAddress,
): Promise<{ ok: boolean; shippingAddress: Address }> {
  return apiFetch<{ ok: boolean; shippingAddress: Address }>(
    "/users/me/shipping-address",
    {
      method: "PUT",
      body: JSON.stringify(address),
    },
  );
}

/* ───────────────────────── Direcciones (multi) ───────────────────────── */

export async function apiListAddresses(): Promise<Address[]> {
  return apiFetch<Address[]>("/users/me/addresses");
}

export async function apiCreateAddress(
  address: ShippingAddress,
): Promise<Address> {
  return apiFetch<Address>("/users/me/addresses", {
    method: "POST",
    body: JSON.stringify(address),
  });
}

export async function apiUpdateAddress(
  id: string,
  address: Partial<ShippingAddress>,
): Promise<Address> {
  return apiFetch<Address>(`/users/me/addresses/${id}`, {
    method: "PATCH",
    body: JSON.stringify(address),
  });
}

export async function apiDeleteAddress(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/users/me/addresses/${id}`, {
    method: "DELETE",
  });
}

export async function apiSetDefaultAddress(id: string): Promise<Address> {
  return apiFetch<Address>(`/users/me/addresses/${id}/default`, {
    method: "PATCH",
  });
}

export async function apiGetOrdersMine(): Promise<Order[]> {
  return apiFetch<Order[]>("/orders/mine");
}

/* ─────────── Detalle de una orden (shape real del backend) ─────────── */

export interface OrderDetailItem {
  id: string;
  order_id: string;
  product_variant_id: string;
  product_name_snapshot: string;
  variant_label: string;
  unit_price_cop: number;
  quantity: number;
  created_at: string;
}

export interface OrderShippingAddress {
  label?: AddressLabel;
  recipientName?: string;
  line1: string;
  line2?: string;
  neighborhood: string;
  city: string;
  department: string;
  postalCode?: string;
  country?: string;
  phone: string;
  notes?: string;
}

export interface OrderDetail {
  id: string;
  user_id: string;
  status: "PENDING_PAYMENT" | "PAID" | "SHIPPED" | "DELIVERED" | "CANCELLED";
  total_cop: number;
  shipping_cost_cop: number;
  currency: "COP";
  shipping_address: OrderShippingAddress;
  shipping_city: string;
  shipping_department: string;
  shipping_phone: string;
  notes: string | null;
  habeas_data_accepted: boolean;
  stripe_payment_intent_id: string | null;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  items: OrderDetailItem[];
  delivery_id?: string | null;
  delivery_status?: DeliveryAssignmentStatus | null;
  delivery_warning?: string | null;
  estimated_delivery_at?: string | null;
  qr_consumed_at?: string | null;
  /** Datos de receptor que el cliente guardó; viajan dentro del QR. */
  receiver_prefilled?: {
    nombreReceptor: string;
    tipoDocumento: DocumentType;
    numeroDocumento: string;
  } | null;
  delivery_confirmation?:
    | "PENDING_CLIENT"
    | "ACCEPTED"
    | "AUTO_ACCEPTED"
    | "DISPUTED"
    | null;
  delivery_simulated_at?: string | null;
  delivery_auto_confirm_at?: string | null;
  /** 24 h: recordatorio al cliente antes de que venza la ventana. */
  delivery_reminder_at?: string | null;
  delivery_reminder_sent_at?: string | null;
  /** true si el repartidor simuló la entrega sin su PIN. */
  delivery_pin_skipped?: boolean;
  delivery_disputed_at?: string | null;
  delivery_dispute_reason?: string | null;
  delivery_dispute_resolution?: "REFUNDED" | "FORCED_ACCEPTED" | null;
  delivery_dispute_resolved_at?: string | null;
  delivery_dispute_resolved_by?: string | null;
  delivery_dispute_resolution_note?: string | null;
  subtotal_cop?: number | null;
  discount_cop?: number | null;
  coupon_code?: string | null;
  tax_cop?: number | null;
  taxable_base_cop?: number | null;
  shipping_tax_cop?: number | null;
  billing_document_type?: "CC" | "CE" | "PP" | "NIT" | null;
  billing_document_number?: string | null;
  billing_legal_name?: string | null;
  billing_email?: string | null;
  invoice_status?: InvoiceStatus | null;
  /** Factura electrónica emitida (null si aún no existe). */
  invoice?: InvoiceSummary | null;
  shipping_carrier?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  return_request?: OrderReturnRequest | null;
}

export async function apiGetOrder(id: string): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/orders/${id}`);
}

/* ─────────── Admin: productos / pedidos / usuarios ─────────── */

export interface AdminUserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: "CUSTOMER" | "ADMIN" | "REPARTIDOR";
  blocked: boolean;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  action: string;
  target: string;
  metadata: Record<string, any>;
  created_at: string;
}

export async function apiMfaSetup(): Promise<{
  id: string;
  secret: string;
  qrCode: string;
}> {
  return apiFetch<{ id: string; secret: string; qrCode: string }>("/auth/mfa/totp/setup", {
    method: "POST",
  });
}

export async function apiMfaVerify(_factorId: string, code: string): Promise<{ ok: boolean }> {
  // Activa MFA en el backend (set mfa_enabled=true). El factorId es el user.id
  // y el backend lo toma del token, por eso ya no se envía.
  return apiFetch<{ ok: boolean }>("/auth/mfa/totp/activate", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function apiMfaDisable(_factorId: string, code: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/auth/mfa/disable", {
    method: "DELETE",
    body: JSON.stringify({ code }),
  });
}

export async function apiMfaListFactors(): Promise<{
  factors: Array<{ id: string; factor_type: string }>;
  totp?: { id: string; factor_type: string };
}> {
  return apiFetch<{
    factors: Array<{ id: string; factor_type: string }>;
    totp?: { id: string; factor_type: string };
  }>("/auth/mfa/factors");
}

export async function apiAdminListAuditLogs(
  cursor?: string,
  action?: string,
): Promise<{
  rows: AuditLogEntry[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const q = new URLSearchParams();
  if (cursor) q.set("cursor", cursor);
  if (action) q.set("action", action);
  return apiFetch<{
    rows: AuditLogEntry[];
    nextCursor: string | null;
    hasMore: boolean;
  }>(`/audit-logs?${q.toString()}`);
}

export async function apiAdminListUsers(
  limit = 50,
  cursor?: string,
  filters?: { search?: string; role?: string },
): Promise<{
  rows: AdminUserRow[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const q = new URLSearchParams();
  q.set("limit", String(limit));
  if (cursor) q.set("cursor", cursor);
  if (filters?.search) q.set("search", filters.search);
  if (filters?.role) q.set("role", filters.role);
  return apiFetch<{
    rows: AdminUserRow[];
    nextCursor: string | null;
    hasMore: boolean;
  }>(`/users?${q.toString()}`);
}

export async function apiAdminCreateUser(
  email: string,
  fullName?: string,
  role?: string,
  password?: string,
): Promise<AdminUserRow> {
  return apiFetch<AdminUserRow>("/users", {
    method: "POST",
    body: JSON.stringify({ email, fullName, role, password }),
  });
}

export async function apiAdminUpdateUser(
  id: string,
  patch: Record<string, any>,
): Promise<AdminUserRow> {
  return apiFetch<AdminUserRow>(`/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function apiAdminDeleteUser(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/users/${id}`, { method: "DELETE" });
}

export async function apiAdminBulkImportUsers(
  users: Array<{ email: string; fullName?: string; role?: string }>,
): Promise<{
  created: Array<{ id: string; email: string }>;
  failed: Array<{ email: string; reason: string }>;
  summary: { total: number; successful: number; failed: number };
}> {
  return apiFetch<{
    created: Array<{ id: string; email: string }>;
    failed: Array<{ email: string; reason: string }>;
    summary: { total: number; successful: number; failed: number };
  }>("/users/bulk", {
    method: "POST",
    body: JSON.stringify({ users }),
  });
}

export async function apiAdminBlockUser(id: string): Promise<AdminUserRow> {
  return apiFetch<AdminUserRow>(`/users/${id}/block`, { method: "PATCH" });
}

export async function apiAdminUnblockUser(id: string): Promise<AdminUserRow> {
  return apiFetch<AdminUserRow>(`/users/${id}/unblock`, { method: "PATCH" });
}

export async function apiAdminListOrders(cursor?: string): Promise<OrderDetail[]> {
  const q = new URLSearchParams();
  if (cursor) q.set("cursor", cursor);
  return apiFetch<OrderDetail[]>(`/orders?${q.toString()}`);
}

export async function apiAdminShipOrder(
  id: string,
  dto?: { carrier?: string; trackingNumber?: string; trackingUrl?: string },
): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/orders/${id}/ship`, {
    method: "PATCH",
    body: dto ? JSON.stringify(dto) : undefined,
  });
// Removed legacy single-line return
}

// Nota: los reembolsos ya no se exponen como acción directa del admin. Sólo
// se emiten como resultado de resolver una disputa (ver apiAdminResolveDispute).

export interface AdminDispute extends OrderDetail {
  customer: { email: string | null; full_name: string | null } | null;
  domiciliario: {
    id: string;
    nombre_completo: string;
    placa: string;
    vehiculo: string;
  } | null;
  recibido?: Array<{
    nombre_receptor: string;
    tipo_documento: string;
    numero_documento: string;
    fuente: string;
    fecha: string;
    hora: string;
  }>;
}

export async function apiAdminListDisputes(resolved = false): Promise<AdminDispute[]> {
  return apiFetch<AdminDispute[]>(
    `/admin/orders/disputed?resolved=${resolved ? "1" : "0"}`,
  );
}

export async function apiAdminResolveDispute(
  orderId: string,
  decision: "REFUND" | "ACCEPT_DELIVERY",
  note?: string,
): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/admin/orders/${orderId}/resolve-dispute`, {
    method: "POST",
    body: JSON.stringify({ decision, note }),
  });
}

export async function apiAdminDeliverOrder(id: string): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/orders/${id}/deliver`, { method: "PATCH" });
}

export async function apiAdminAssignDelivery(
  id: string,
  domiciliarioId?: string,
): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/orders/${id}/assign-delivery`, {
    method: "POST",
    body: JSON.stringify(domiciliarioId ? { domiciliarioId } : {}),
  });
}

/**
 * DEV ONLY — Simula un `payment_intent.succeeded` para una orden
 * (marca PAID + decrementa stock + encola correo). Útil cuando no se tiene
 * Stripe CLI corriendo. Devuelve 403 en producción.
 */
export async function apiAdminSimulatePaid(
  orderId: string,
): Promise<{ ok: true; orderId: string; status: string }> {
  return apiFetch(`/payments/dev/simulate-paid/${orderId}`, { method: "POST" });
}

export interface AdminVariantInput {
  /** Presente al editar una variante existente (permite cambiar su SKU). */
  id?: string;
  size: string;
  colorName: string;
  colorHex: string;
  sku: string;
  stock: number;
}

export interface AdminProductInput {
  slug: string;
  name: string;
  brand: string;
  description: string;
  gender: Gender;
  category: CategorySlug;
  priceCop: number;
  images: string[];
  variants: AdminVariantInput[];
  active?: boolean;
  /** ISO-8601. Null limpia el campo. Undefined no toca el valor en update. */
  dropStartsAt?: string | null;
  dropEndsAt?: string | null;
  compareAtPriceCop?: number | null;
  fit?: "slim" | "regular" | "relaxed" | "oversize" | null;
  sizeGuide?: Record<string, any> | null;
}

/** Producto tal como lo ve el panel admin (incluye el flag `active`). */
export type AdminProduct = Product & { active: boolean };

function mapAdminProduct(api: ApiProduct): AdminProduct {
  return { ...mapApiProductToProduct(api), active: api.active };
}

/**
 * Lista TODOS los productos (activos e inactivos) para el panel admin.
 * Requiere sesión ADMIN. No usa el endpoint público, que tiene tope de 100
 * y oculta los inactivos.
 */
export async function fetchAdminProducts(): Promise<AdminProduct[]> {
  const data = await apiFetch<ApiProduct[]>("/products/admin/list", {
    cache: "no-store",
  });
  return data.map(mapAdminProduct);
}

export interface SearchProductsResponse {
  query: string;
  total: number;
  tookMs: number;
  source: string;
  results: AdminProduct[];
}

/**
 * Búsqueda inteligente full-text conectada al motor aislado y/o Elasticsearch.
 */
export async function apiSearchProducts(
  query: string,
  options?: { includeInactive?: boolean; gender?: string; category?: string },
): Promise<SearchProductsResponse> {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (options?.gender) params.set("gender", options.gender);
  if (options?.category) params.set("category", options.category);

  // Endpoint distinto para admin — el público nunca lista inactivos.
  const base = options?.includeInactive
    ? "/products/admin/search"
    : "/products/search";

  const res = await apiFetch<{
    query: string;
    total: number;
    tookMs: number;
    source: string;
    results: any[];
  }>(`${base}?${params.toString()}`, {
    cache: "no-store",
  });

  return {
    ...res,
    results: res.results.map((p) => ({
      ...mapApiProductToProduct(p),
      active: Boolean(p.active),
    })),
  };
}

/**
 * Solicita reindexación en segundo plano del catálogo.
 */
export async function apiTriggerCatalogReindex(): Promise<{ ok: boolean; message: string }> {
  return apiFetch<{ ok: boolean; message: string }>("/products/admin/search/reindex", {
    method: "POST",
  });
}

/**
 * Descarga todos los productos en formato JSON directamente desde el
 * motor de búsqueda aislado (sin impactar la base de datos principal).
 */
export async function apiExportProductsJson(): Promise<{
  exportedAt: string;
  source: string;
  total: number;
  products: any[];
}> {
  return apiFetch("/products/admin/export/json", {
    cache: "no-store",
  });
}

/** Detalle de un producto por id para el panel admin (incluye inactivos). */
export async function fetchAdminProduct(id: string): Promise<AdminProduct> {
  const data = await apiFetch<ApiProduct>(`/products/admin/${id}`, {
    cache: "no-store",
  });
  return mapAdminProduct(data);
}

export async function apiAdminCreateProduct(dto: AdminProductInput) {
  return apiFetch<ApiProduct>("/products", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export async function apiAdminUpdateProduct(
  id: string,
  dto: Partial<AdminProductInput>,
) {
  return apiFetch<ApiProduct & { archivedVariants?: string[] }>(
    `/products/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(dto),
    },
  );
}

/**
 * Borra un producto. Si ya tiene pedidos, el backend no lo borra (rompería el
 * histórico) y lo desactiva: `archived: true`.
 */
export async function apiAdminDeleteProduct(id: string) {
  return apiFetch<{ ok: true; archived: boolean }>(`/products/${id}`, {
    method: "DELETE",
  });
}

interface SignUploadResponse {
  signedUrl: string;
  token: string;
  path: string;
  publicUrl: string;
  maxSizeBytes: number;
  allowedTypes: string[];
}

/**
 * Sube una imagen de producto a Supabase Storage pasando por un signed URL
 * generado por el backend. Devuelve la publicUrl que puede ir directo al
 * array `images` del producto.
 */
export async function apiAdminUploadProductImage(file: File): Promise<string> {
  const sig = await apiFetch<SignUploadResponse>(
    "/uploads/product-image/sign",
    {
      method: "POST",
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
      }),
    },
  );

  if (file.size > sig.maxSizeBytes) {
    throw new Error(
      `El archivo supera el tamaño máximo permitido (${Math.round(
        sig.maxSizeBytes / 1024 / 1024,
      )}MB).`,
    );
  }

  const putRes = await fetch(sig.signedUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!putRes.ok) {
    throw new Error(`Error subiendo imagen (HTTP ${putRes.status}).`);
  }

  return sig.publicUrl;
}

export interface BillingInfo {
  documentType: "CC" | "CE" | "PP" | "NIT";
  documentNumber: string;
  legalName: string;
  email?: string;
}

export interface CreateOrderParams {
  items: { variantId: string; quantity: number }[];
  shippingAddress: ShippingAddress;
  /** Datos fiscales para la factura electrónica (opcional). */
  billing?: BillingInfo;
  habeasDataAccepted: true;
  couponCode?: string;
}

export async function apiCreateOrder(dto: CreateOrderParams): Promise<Order> {
  // Idempotency-Key: UUID por intento de checkout. Si el request se reintenta
  // (timeout, retry del browser, doble submit), el backend devuelve el mismo
  // pedido en vez de crear uno duplicado. Se genera una sola vez por llamada.
  return apiFetch<Order>("/orders", {
    method: "POST",
    body: JSON.stringify(dto),
    headers: { "Idempotency-Key": generateIdempotencyKey() },
  });
}

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  // Fallback para contextos sin crypto.randomUUID (muy raro en browsers modernos)
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 14).padEnd(12, "x")
  );
}

export interface PaymentIntentResponse {
  clientSecret: string;
  customerSessionClientSecret?: string;
  intentId: string;
  amount: number;
  currency: string;
}

export async function apiCreatePaymentIntent(
  orderId: string,
  currency = "COP",
): Promise<PaymentIntentResponse> {
  return apiFetch<PaymentIntentResponse>("/payments/intent", {
    method: "POST",
    body: JSON.stringify({ orderId, currency }),
  });
}

export interface ExchangeRates {
  USD: number;
  EUR: number;
}

export async function apiGetExchangeRates(): Promise<ExchangeRates> {
  return apiFetch<ExchangeRates>("/exchange-rates");
}

/* ───────────────────────── Delivery / Domiciliarios ───────────────────────── */

export type DeliveryAvailability = "DISPONIBLE" | "OCUPADO" | "INACTIVO";
export type DeliveryAssignmentStatus = "ASSIGNED" | "REASSIGNED_DEPT" | "UNASSIGNED";

export interface Domiciliario {
  id: string;
  user_id: string;
  nombre_completo: string;
  departamento: string;
  ciudad: string;
  vehiculo: string;
  placa: string;
  ciudad_placa: string;
  disponibilidad: DeliveryAvailability;
  created_at: string;
  updated_at: string;
}

export interface DeliveryOrder extends Partial<OrderDetail> {
  id: string;
  status: Order["status"];
  shipping_city: string;
  shipping_department: string;
  shipping_phone: string;
  shipping_address: OrderShippingAddress;
  estimated_delivery_at: string | null;
  delivery_status: DeliveryAssignmentStatus | null;
  delivery_warning: string | null;
  qr_consumed_at: string | null;
  receiver_prefilled: {
    nombreReceptor: string;
    tipoDocumento: DocumentType;
    numeroDocumento: string;
  } | null;
  customer?: {
    email: string | null;
    full_name: string | null;
  } | null;
}

export interface DeliveryBono {
  id: string;
  order_id: string;
  base_cop: number;
  km_extra: number;
  bono_cop: number;
  motivo: string;
  created_at: string;
  order?: { shipping_city: string; shipping_department: string };
}

export async function apiAdminListDeliveries(): Promise<
  Array<Domiciliario & { user?: { email: string; full_name: string | null } }>
> {
  return apiFetch("/admin/deliveries");
}

export async function apiAdminCreateDelivery(dto: {
  userId?: string;
  email?: string;
  password?: string;
  nombreCompleto: string;
  departamento: string;
  ciudad: string;
  vehiculo: string;
  placa: string;
  ciudadPlaca: string;
  disponibilidad?: DeliveryAvailability;
}): Promise<Domiciliario> {
  return apiFetch("/admin/deliveries", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export async function apiAdminUpdateDelivery(
  id: string,
  patch: Partial<Omit<Domiciliario, "id" | "user_id" | "created_at" | "updated_at">>,
): Promise<Domiciliario> {
  // Convertir snake → camel para el DTO del backend
  const mapped: Record<string, unknown> = {};
  if (patch.nombre_completo !== undefined) mapped.nombreCompleto = patch.nombre_completo;
  if (patch.departamento !== undefined) mapped.departamento = patch.departamento;
  if (patch.ciudad !== undefined) mapped.ciudad = patch.ciudad;
  if (patch.vehiculo !== undefined) mapped.vehiculo = patch.vehiculo;
  if (patch.placa !== undefined) mapped.placa = patch.placa;
  if (patch.ciudad_placa !== undefined) mapped.ciudadPlaca = patch.ciudad_placa;
  if (patch.disponibilidad !== undefined) mapped.disponibilidad = patch.disponibilidad;
  return apiFetch(`/admin/deliveries/${id}`, {
    method: "PATCH",
    body: JSON.stringify(mapped),
  });
}

export async function apiAdminDeleteDelivery(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/admin/deliveries/${id}`, { method: "DELETE" });
}

export async function apiDeliveryGetProfile(): Promise<Domiciliario> {
  return apiFetch("/delivery/mine/profile");
}

export async function apiDeliveryUpdateProfile(dto: {
  nombreCompleto?: string;
  departamento?: string;
  ciudad?: string;
  vehiculo?: string;
  placa?: string;
  ciudadPlaca?: string;
  disponibilidad?: DeliveryAvailability;
}): Promise<Domiciliario> {
  return apiFetch("/delivery/mine/profile", {
    method: "PATCH",
    body: JSON.stringify(dto),
  });
}

export async function apiDeliveryListOrders(status?: string): Promise<DeliveryOrder[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch(`/delivery/mine/orders${q}`);
}

export async function apiDeliveryGetOrder(orderId: string): Promise<any> {
  return apiFetch(`/delivery/mine/orders/${orderId}`);
}

export async function apiDeliveryListBonos(): Promise<DeliveryBono[]> {
  return apiFetch("/delivery/mine/bonos");
}

export async function apiDeliverySetPin(pin: string, currentPin?: string) {
  return apiFetch("/delivery/mine/pin", {
    method: "POST",
    body: JSON.stringify({ pin, currentPin }),
  });
}

export async function apiDeliveryScanQr(dto: {
  token: string;
  receiverName?: string;
  documentType?: DocumentType;
  documentNumber?: string;
}): Promise<{
  ok: boolean;
  orderId: string;
  needsReceiverData: boolean;
  prefill: {
    nombreReceptor: string;
    tipoDocumento: DocumentType;
    numeroDocumento: string;
  } | null;
}> {
  return apiFetch("/delivery/scan-qr", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export async function apiDeliveryConfirm(
  orderId: string,
  dto: {
    receiverName: string;
    documentType: DocumentType;
    documentNumber: string;
    source: "qr" | "manual";
  },
): Promise<OrderDetail> {
  return apiFetch(`/delivery/confirm/${orderId}`, {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export async function apiDeliverySimulate(
  orderId: string,
  dto: {
    /** PIN del repartidor. Obligatorio salvo que `skipPin` sea true. */
    pin?: string;
    /** El repartidor declara que no tiene el PIN a mano. */
    skipPin?: boolean;
    receiverName?: string;
    documentType?: DocumentType;
    documentNumber?: string;
  },
): Promise<OrderDetail> {
  return apiFetch(`/delivery/simulate/${orderId}`, {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export async function apiDeliveryVerifyClientCode(
  orderId: string,
  code: string,
): Promise<{
  ok: true;
  orderId: string;
  needsReceiverData: boolean;
  prefill: {
    nombreReceptor?: string;
    tipoDocumento?: DocumentType;
    numeroDocumento?: string;
  } | null;
}> {
  return apiFetch(`/delivery/verify-code/${orderId}`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

/**
 * Verifica el código de 4 dígitos sin saber de antemano a qué pedido
 * corresponde (el repartidor lo escucha del cliente). El backend lo resuelve
 * entre las entregas activas asignadas a él.
 */
export async function apiDeliveryVerifyClientCodeAnywhere(code: string): Promise<{
  ok: true;
  orderId: string;
  needsReceiverData: boolean;
  prefill: {
    nombreReceptor?: string;
    tipoDocumento?: DocumentType;
    numeroDocumento?: string;
  } | null;
}> {
  return apiFetch(`/delivery/verify-code`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function apiDeliveryGetClientInfo(orderId: string): Promise<{
  fullName: string | null;
  documentType: DocumentType | null;
  documentNumber: string | null;
}> {
  return apiFetch(`/delivery/mine/orders/${orderId}/client-info`);
}

/* ───────────────────────── QR del cliente ───────────────────────── */

export interface OrderQrPayload {
  consumed: boolean;
  consumedAt?: string;
  token?: string;
  dataUrl?: string;
  exp?: number;
  /** Código numérico de 4 dígitos equivalente al QR (dicta al repartidor). */
  clientCode?: string;
  /** Epoch seconds en que expira el `clientCode`. */
  clientCodeExp?: number;
  estimatedDeliveryAt: string | null;
  deliveryWarning: string | null;
  deliveryStatus?: DeliveryAssignmentStatus | null;
  /**
   * Datos de receptor que el cliente guardó para este pedido. El repartidor
   * los recibe al escanear el QR, así que la pantalla del cliente los usa
   * para precargar el formulario y avisar si faltan.
   */
  receiverPrefilled?: {
    nombreReceptor?: string;
    tipoDocumento?: DocumentType;
    numeroDocumento?: string;
  } | null;
}

export async function apiGetOrderQr(
  orderId: string,
  /** Epoch seconds del código que la página ya muestra: el backend lo conserva. */
  keepCodeExp?: number,
): Promise<OrderQrPayload> {
  const query = keepCodeExp ? `?keepCode=${keepCodeExp}` : "";
  return apiFetch(`/orders/${orderId}/qr${query}`);
}

export async function apiConfirmDelivery(orderId: string): Promise<OrderDetail> {
  return apiFetch(`/orders/${orderId}/confirm-delivery`, { method: "POST" });
}

export async function apiDisputeDelivery(
  orderId: string,
  reason?: string,
): Promise<OrderDetail> {
  return apiFetch(`/orders/${orderId}/dispute-delivery`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function apiSaveOrderReceiver(
  orderId: string,
  dto: {
    nombreReceptor: string;
    tipoDocumento: DocumentType;
    numeroDocumento: string;
  },
): Promise<{ ok: true }> {
  return apiFetch(`/orders/${orderId}/receiver-data`, {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

/* ───────────────────────── Push notifications ───────────────────────── */

export async function apiDemoSignIn(
  role: "CUSTOMER" | "ADMIN" | "REPARTIDOR",
): Promise<AuthResponse & { role: string }> {
  cleanupLegacyTokens();
  const res = startDemoSession(role);
  return res;
}

export type ReturnType = "RETRACT_REFUND" | "SIZE_EXCHANGE" | "DEFECTIVE";
export type ReturnStatus =
  | "REQUESTED"
  | "APPROVED_REFUNDED"
  | "APPROVED_EXCHANGED"
  | "REJECTED";

export interface OrderReturnRequest {
  id: string;
  order_id: string;
  user_id: string;
  type: ReturnType;
  status: ReturnStatus;
  reason: string;
  requested_size: string | null;
  admin_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminReturnRow extends OrderReturnRequest {
  order: OrderDetail | null;
  customer: { id: string; email: string | null; full_name: string | null } | null;
}

export interface ValidatedCoupon {
  code: string;
  discountType: "PERCENT" | "FIXED_COP";
  discountValue: number;
  minSubtotalCop: number;
  discountCop: number;
}

export async function apiValidateCoupon(
  code: string,
  subtotalCop: number,
): Promise<ValidatedCoupon> {
  return apiFetch<ValidatedCoupon>("/orders/validate-coupon", {
    method: "POST",
    body: JSON.stringify({ code, subtotalCop }),
  });
}

export async function apiCancelOrder(orderId: string): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/orders/${orderId}/cancel`, {
    method: "POST",
  });
}

export async function apiRequestOrderReturn(
  orderId: string,
  dto: {
    type: ReturnType;
    reason: string;
    requestedSize?: string;
  },
): Promise<OrderReturnRequest> {
  return apiFetch<OrderReturnRequest>(`/orders/${orderId}/returns`, {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export async function apiAdminListReturns(
  resolved = false,
): Promise<AdminReturnRow[]> {
  return apiFetch<AdminReturnRow[]>(
    `/admin/orders/returns?resolved=${resolved ? "1" : "0"}`,
  );
}

export async function apiAdminResolveReturn(
  orderId: string,
  decision: "APPROVE_REFUND" | "APPROVE_EXCHANGE" | "REJECT",
  note?: string,
): Promise<OrderReturnRequest> {
  return apiFetch<OrderReturnRequest>(`/admin/orders/${orderId}/resolve-return`, {
    method: "POST",
    body: JSON.stringify({ decision, note }),
  });
}

export async function apiPushPublicKey(): Promise<{ enabled: boolean; publicKey: string | null }> {
  return apiFetch("/push/public-key");
}

export async function apiPushSubscribe(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<{ ok: boolean }> {
  return apiFetch("/push/subscribe", {
    method: "POST",
    body: JSON.stringify(sub),
  });
}

export async function apiPushUnsubscribe(endpoint: string): Promise<{ ok: boolean }> {
  return apiFetch("/push/subscribe", {
    method: "DELETE",
    body: JSON.stringify({ endpoint }),
  });
}

/* ───────────────────── Facturación electrónica DIAN ───────────────────── */

export type InvoiceProviderId =
  | "DIAN_SIMULATED"
  | "DIAN_FREE"
  | "DIAN_OWN"
  | "FACTUS";

export type InvoiceEnvironment = "HABILITACION" | "PRODUCCION";

export type InvoiceStatus =
  | "PENDING"
  | "PENDING_MANUAL"
  | "ISSUED"
  | "REJECTED"
  | "FAILED"
  | "VOID";

export type InvoiceEventType =
  | "CREATED"
  | "SENT"
  | "ACCEPTED"
  | "REJECTED"
  | "RETRY"
  | "MANUAL_MARK"
  | "CREDIT_NOTE"
  | "VOID";

export interface InvoiceOrderSnapshot {
  id: string;
  user_id?: string;
  status?: OrderDetail["status"];
  total_cop?: number;
  created_at?: string;
  billing_legal_name?: string | null;
  billing_document_number?: string | null;
  billing_email?: string | null;
  shipping_city?: string | null;
  shipping_department?: string | null;
}

export interface InvoiceSummary {
  id: string;
  order_id: string;
  number: number | null;
  prefix: string | null;
  full_number: string | null;
  cufe: string | null;
  status: InvoiceStatus;
  provider: InvoiceProviderId;
  environment: InvoiceEnvironment;
  issue_date: string;
  accepted_at: string | null;
  total_cop: number;
  tax_cop: number;
  taxable_base_cop: number;
  dian_status_code: string | null;
  dian_message: string | null;
  qr_data_url?: string | null;
  public_url: string | null;
  /** Presente en los listados administrativos. */
  order?: InvoiceOrderSnapshot | null;
}

export interface InvoiceLineRow {
  id: string;
  invoice_id: string;
  order_item_id: string | null;
  position: number;
  description: string;
  quantity: number;
  unit_price_cop: number;
  discount_cop: number;
  tax_rate: number;
  tax_cop: number;
  line_total_cop: number;
  tax_scheme: string;
  created_at: string;
}

export interface InvoiceEventRow {
  id: string;
  invoice_id: string;
  type: InvoiceEventType;
  payload: Record<string, unknown>;
  actor_id: string | null;
  created_at: string;
}

export interface CreditNoteRow {
  id: string;
  invoice_id: string;
  order_id: string;
  number: number | null;
  prefix: string | null;
  full_number: string | null;
  cufe: string | null;
  status: "PENDING" | "ISSUED" | "REJECTED" | "FAILED";
  reason: string;
  amount_cop: number;
  created_by: string | null;
  issued_at: string;
  created_at: string;
}

export interface InvoiceBuyerSnapshot {
  document_type?: "CC" | "CE" | "PP" | "NIT";
  document_number?: string;
  legal_name?: string;
  email?: string | null;
  address?: string | null;
  municipality?: string;
  department?: string;
  phone?: string | null;
  regime?: string;
}

export interface InvoiceDetail extends InvoiceSummary {
  currency: "COP";
  payment_method: string;
  xml_content: string | null;
  xml_url: string | null;
  pdf_url: string | null;
  dian_track_id: string | null;
  last_error: string | null;
  retry_count: number;
  seller_snapshot: Record<string, unknown>;
  buyer_snapshot: InvoiceBuyerSnapshot;
  created_at: string;
  updated_at: string;
  order: (OrderDetail & { items: OrderDetailItem[] }) | null;
  lines: InvoiceLineRow[];
  events: InvoiceEventRow[];
  credit_notes: CreditNoteRow[];
}

export interface FiscalSettings {
  legal_name: string;
  trade_name: string;
  nit: string;
  dv: string;
  tax_regime: string;
  fiscal_responsibilities: string[];
  address: string;
  municipality_code: string;
  municipality: string;
  department: string;
  email: string;
  phone: string;
  logo_url: string | null;
  invoice_provider: InvoiceProviderId;
  environment: InvoiceEnvironment;
  enabled: boolean;
  demo_mode: boolean;
  software_id: string | null;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  updated_at: string;
  hasSoftwarePin: boolean;
  hasCertificate: boolean;
  hasCertificatePassword: boolean;
}

export interface InvoiceNumberingRange {
  id: string;
  document_type: "FV" | "NC" | "ND" | "POS";
  prefix: string;
  resolution_number: string | null;
  resolution_date: string | null;
  range_from: number;
  range_to: number;
  current_number: number;
  valid_from: string | null;
  valid_to: string | null;
  technical_key: string | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface InvoicingStats {
  pending: number;
  issued: number;
  rejected: number;
  failed: number;
  void: number;
  pendingManual: number;
  totalIssuedCop: number;
  total: number;
}

export interface InvoicingListResponse {
  invoices: InvoiceSummary[];
  stats: InvoicingStats;
  fiscal: {
    provider: InvoiceProviderId;
    environment: InvoiceEnvironment;
    enabled: boolean;
    demoMode: boolean;
    legalName: string;
    nit: string;
    dv: string;
  };
}

export interface IssuableOrder {
  id: string;
  status: OrderDetail["status"];
  total_cop: number;
  created_at: string;
  shipping_city: string | null;
  shipping_department: string | null;
  billing_legal_name: string | null;
  billing_document_number: string | null;
  billing_email: string | null;
  invoice_status: string | null;
  invoice: { id: string; status: string; full_number: string | null } | null;
}

export interface FiscalSettingsInput {
  legalName?: string;
  tradeName?: string;
  nit?: string;
  dv?: string;
  taxRegime?: string;
  fiscalResponsibilities?: string[];
  address?: string;
  municipalityCode?: string;
  municipality?: string;
  department?: string;
  email?: string;
  phone?: string;
  logoUrl?: string;
  invoiceProvider?: InvoiceProviderId;
  environment?: InvoiceEnvironment;
  enabled?: boolean;
  demoMode?: boolean;
  softwareId?: string;
}

export interface NumberingRangeInput {
  documentType?: "FV" | "NC" | "ND" | "POS";
  prefix?: string;
  resolutionNumber?: string;
  resolutionDate?: string;
  rangeFrom?: number;
  rangeTo?: number;
  validFrom?: string;
  validTo?: string;
  technicalKey?: string;
  active?: boolean;
}

export async function apiAdminGetInvoicingSettings(): Promise<FiscalSettings> {
  return apiFetch<FiscalSettings>("/admin/invoicing/settings");
}

export async function apiAdminUpdateInvoicingSettings(
  dto: FiscalSettingsInput,
): Promise<FiscalSettings> {
  return apiFetch<FiscalSettings>("/admin/invoicing/settings", {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}

export async function apiAdminTestInvoicing(): Promise<{
  ok: boolean;
  provider: InvoiceProviderId;
  environment: InvoiceEnvironment;
  message: string;
}> {
  return apiFetch("/admin/invoicing/test", { method: "POST" });
}

export async function apiAdminListNumbering(): Promise<InvoiceNumberingRange[]> {
  return apiFetch<InvoiceNumberingRange[]>("/admin/invoicing/numbering");
}

export async function apiAdminCreateNumbering(
  dto: NumberingRangeInput &
    Required<Pick<NumberingRangeInput, "documentType" | "prefix" | "rangeFrom" | "rangeTo">>,
): Promise<InvoiceNumberingRange> {
  return apiFetch<InvoiceNumberingRange>("/admin/invoicing/numbering", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export async function apiAdminUpdateNumbering(
  id: string,
  dto: NumberingRangeInput,
): Promise<InvoiceNumberingRange> {
  return apiFetch<InvoiceNumberingRange>(`/admin/invoicing/numbering/${id}`, {
    method: "PATCH",
    body: JSON.stringify(dto),
  });
}

export async function apiAdminListInvoices(params: {
  status?: string;
  q?: string;
  limit?: number;
} = {}): Promise<InvoicingListResponse> {
  const query = new URLSearchParams();
  if (params.status && params.status !== "ALL") query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.limit) query.set("limit", String(params.limit));
  const suffix = query.toString();
  return apiFetch<InvoicingListResponse>(
    `/admin/invoices${suffix ? `?${suffix}` : ""}`,
  );
}

export async function apiAdminListIssuableOrders(): Promise<IssuableOrder[]> {
  return apiFetch<IssuableOrder[]>("/admin/invoices/issuable-orders");
}

export async function apiAdminGetInvoice(id: string): Promise<InvoiceDetail> {
  return apiFetch<InvoiceDetail>(`/admin/invoices/${id}`);
}

export async function apiAdminIssueInvoice(orderId: string): Promise<InvoiceDetail> {
  return apiFetch<InvoiceDetail>(`/admin/orders/${orderId}/invoice`, {
    method: "POST",
  });
}

export async function apiAdminRetryInvoice(id: string): Promise<InvoiceDetail> {
  return apiFetch<InvoiceDetail>(`/admin/invoices/${id}/retry`, {
    method: "POST",
  });
}

export async function apiAdminMarkInvoiceIssued(
  id: string,
  dto: { cufe: string; number?: number; xml?: string; message?: string },
): Promise<InvoiceDetail> {
  return apiFetch<InvoiceDetail>(`/admin/invoices/${id}/mark-issued`, {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export async function apiAdminCreateCreditNote(
  id: string,
  dto: { reason: string; amountCop?: number },
): Promise<InvoiceDetail> {
  return apiFetch<InvoiceDetail>(`/admin/invoices/${id}/credit-note`, {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export async function apiAdminDownloadInvoiceXml(
  id: string,
): Promise<{ filename: string; xml: string }> {
  return apiFetch(`/admin/invoices/${id}/xml`);
}

export async function apiAdminInvoiceRepresentation(
  id: string,
): Promise<{ filename: string; html: string }> {
  return apiFetch(`/admin/invoices/${id}/representation`);
}
