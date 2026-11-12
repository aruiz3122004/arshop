/**
 * Motor de Demostración Local (Modo Portafolio / Demo 1-Clic)
 *
 * Todas las operaciones de prueba corren 100% en el navegador (localStorage)
 * sin tocar Supabase ni la base de datos real.
 *
 * Características:
 * - TTL automático de 30 minutos: al expirar o al salir, se destruye todo rastro.
 * - Si el usuario recarga la página dentro de los 30 minutos, sus acciones simuladas persisten.
 * - Provee datos de ejemplo realistas para los 3 roles: CUSTOMER, ADMIN y REPARTIDOR.
 * - Permite probar todas las funcionalidades: pedidos, productos, repartidores,
 *   disputas, QR, devoluciones, usuarios y logs.
 */

import type {
  AdminDispute,
  AdminProduct,
  AdminReturnRow,
  AdminUserRow,
  AuditLogEntry,
  DeliveryBono,
  DeliveryOrder,
  Domiciliario,
  OrderDetail,
  OrderQrPayload,
  UserProfile,
} from "./api";

const DEMO_STORAGE_KEY = "arshop:demo_state_v1";
export const DEMO_TTL_MS = 30 * 60 * 1000; // 30 minutos

export interface DemoSession {
  role: "CUSTOMER" | "ADMIN" | "REPARTIDOR";
  startedAt: number;
  expiresAt: number;
  user: UserProfile;
}

export interface DemoDatabase {
  users: AdminUserRow[];
  products: AdminProduct[];
  orders: OrderDetail[];
  domiciliarios: Array<Domiciliario & { user?: { email: string; full_name: string | null } }>;
  disputes: AdminDispute[];
  returns: AdminReturnRow[];
  bonos: DeliveryBono[];
  auditLogs: AuditLogEntry[];
  deliveryPin: string;
}

export interface DemoState {
  session: DemoSession | null;
  db: DemoDatabase;
}

// ── Semillas de Datos de Demostración ──────────────────────────────────────────

function createInitialDemoDatabase(): DemoDatabase {
  const now = new Date();
  const dIso = (offsetMinutes = 0) =>
    new Date(now.getTime() - offsetMinutes * 60 * 1000).toISOString();

  // Usuarios iniciales
  const users: AdminUserRow[] = [
    {
      id: "demo-admin-id",
      email: "demo.admin@arshop.co",
      full_name: "Andrés Mendoza (Admin Demo)",
      role: "ADMIN",
      blocked: false,
      created_at: dIso(120),
    },
    {
      id: "demo-repartidor-id",
      email: "demo.repartidor@arshop.co",
      full_name: "Carlos Ramírez (Domiciliario Demo)",
      role: "REPARTIDOR",
      blocked: false,
      created_at: dIso(90),
    },
    {
      id: "demo-cliente-id",
      email: "demo.cliente@arshop.co",
      full_name: "Valentina Restrepo (Cliente Demo)",
      role: "CUSTOMER",
      blocked: false,
      created_at: dIso(60),
    },
    {
      id: "user-test-01",
      email: "sofia.castro@correo.com",
      full_name: "Sofía Castro Méndez",
      role: "CUSTOMER",
      blocked: false,
      created_at: dIso(2400),
    },
    {
      id: "user-test-02",
      email: "felipe.morales@correo.com",
      full_name: "Felipe Morales Ortiz",
      role: "CUSTOMER",
      blocked: false,
      created_at: dIso(1800),
    },
    {
      id: "user-test-03",
      email: "cuenta.sospechosa@correo.com",
      full_name: "Usuario Bloqueado Demo",
      role: "CUSTOMER",
      blocked: true,
      created_at: dIso(3200),
    },
  ];

  // Productos iniciales
  const products: AdminProduct[] = [
    {
      id: "demo-prod-01",
      slug: "camisa-oxford-blanco-puro",
      name: "Camisa Oxford Blanco Puro",
      brand: "ARShop Atelier",
      price: 249000,
      currency: "COP",
      gender: "hombre",
      category: "camisas",
      images: [
        "https://images.unsplash.com/photo-1621072156002-e2fccdc0b176?w=800&h=1000&fit=crop&q=80",
      ],
      colors: [{ name: "Blanco", hex: "#ffffff" }],
      sizes: ["S", "M", "L", "XL"],
      description: "Popelín de algodón de fibra larga 100%. Cuello francés y corte limpio estructurado.",
      active: true,
      compareAtPrice: 289000,
      fit: "regular",
      variants: [
        { id: "var-01-s", sku: "OXF-BLA-S", size: "S", stock: 12, color_name: "Blanco", color_hex: "#ffffff" },
        { id: "var-01-m", sku: "OXF-BLA-M", size: "M", stock: 18, color_name: "Blanco", color_hex: "#ffffff" },
        { id: "var-01-l", sku: "OXF-BLA-L", size: "L", stock: 7, color_name: "Blanco", color_hex: "#ffffff" },
        { id: "var-01-xl", sku: "OXF-BLA-XL", size: "XL", stock: 4, color_name: "Blanco", color_hex: "#ffffff" },
      ],
    },
    {
      id: "demo-prod-02",
      slug: "camiseta-heavyweight-negro-carbon",
      name: "Camiseta Heavyweight Carbón",
      brand: "ARShop Minimal",
      price: 139000,
      currency: "COP",
      gender: "hombre",
      category: "camisetas",
      images: [
        "https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=800&h=1000&fit=crop&q=80",
      ],
      colors: [{ name: "Carbón", hex: "#1c1c1c" }],
      sizes: ["S", "M", "L"],
      description: "Gramaje 260 GSM con caída pesada arquitectónica, costuras selladas.",
      active: true,
      compareAtPrice: null,
      fit: "oversize",
      variants: [
        { id: "var-02-s", sku: "HW-CRB-S", size: "S", stock: 25, color_name: "Carbón", color_hex: "#1c1c1c" },
        { id: "var-02-m", sku: "HW-CRB-M", size: "M", stock: 30, color_name: "Carbón", color_hex: "#1c1c1c" },
        { id: "var-02-l", sku: "HW-CRB-L", size: "L", stock: 15, color_name: "Carbón", color_hex: "#1c1c1c" },
      ],
    },
    {
      id: "demo-prod-03",
      slug: "pantalon-pleated-lana-fria",
      name: "Pantalón Pleated Lana Fría",
      brand: "ARShop Atelier",
      price: 369000,
      currency: "COP",
      gender: "mujer",
      category: "pantalones",
      images: [
        "https://images.unsplash.com/photo-1637069585336-827b298fe84a?w=800&h=1000&fit=crop&q=80",
      ],
      colors: [{ name: "Grafito", hex: "#383838" }],
      sizes: ["XS / 6", "S / 8", "M / 10"],
      description: "Lana virgen fría transpirable para clima templado y frío con pinzas dobles.",
      active: true,
      compareAtPrice: 420000,
      fit: "relaxed",
      variants: [
        { id: "var-03-xs", sku: "PLE-GRA-XS", size: "XS / 6", stock: 8, color_name: "Grafito", color_hex: "#383838" },
        { id: "var-03-s", sku: "PLE-GRA-S", size: "S / 8", stock: 14, color_name: "Grafito", color_hex: "#383838" },
        { id: "var-03-m", sku: "PLE-GRA-M", size: "M / 10", stock: 10, color_name: "Grafito", color_hex: "#383838" },
      ],
    },
    {
      id: "demo-prod-04",
      slug: "sneakers-cuero-monocromo",
      name: "Sneakers Piel Monocromo",
      brand: "ARShop Studio",
      price: 395000,
      currency: "COP",
      gender: "hombre",
      category: "calzado",
      images: [
        "https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=800&h=1000&fit=crop&q=80",
      ],
      colors: [{ name: "Hueso", hex: "#f3eee5" }],
      sizes: ["40", "41", "42", "43"],
      description: "Cuero vacuno granulado curtido vegetal. Suela de goma vulcanizada tono sobre tono.",
      active: false,
      compareAtPrice: null,
      fit: "regular",
      variants: [
        { id: "var-04-40", sku: "SNK-HUE-40", size: "40", stock: 0, color_name: "Hueso", color_hex: "#f3eee5" },
        { id: "var-04-41", sku: "SNK-HUE-41", size: "41", stock: 0, color_name: "Hueso", color_hex: "#f3eee5" },
      ],
    },
  ];

  // Domiciliarios
  const domiciliarios: Array<Domiciliario & { user?: { email: string; full_name: string | null } }> = [
    {
      id: "dom-01",
      user_id: "demo-repartidor-id",
      nombre_completo: "Carlos Ramírez (Domiciliario Demo)",
      departamento: "Cundinamarca",
      ciudad: "Bogotá",
      vehiculo: "Moto Yamaha FZ 2.0",
      placa: "DEM99G",
      ciudad_placa: "Bogotá",
      disponibilidad: "DISPONIBLE",
      created_at: dIso(500),
      updated_at: dIso(10),
      user: {
        email: "demo.repartidor@arshop.co",
        full_name: "Carlos Ramírez (Domiciliario Demo)",
      },
    },
    {
      id: "dom-02",
      user_id: "dom-user-02",
      nombre_completo: "Mateo Gómez Ríos",
      departamento: "Antioquia",
      ciudad: "Medellín",
      vehiculo: "Bicicleta Eléctrica Trek",
      placa: "MED44B",
      ciudad_placa: "Medellín",
      disponibilidad: "OCUPADO",
      created_at: dIso(1200),
      updated_at: dIso(20),
      user: {
        email: "mateo.gomez@repartidores.arshop.co",
        full_name: "Mateo Gómez Ríos",
      },
    },
    {
      id: "dom-03",
      user_id: "dom-user-03",
      nombre_completo: "Laura Vargas Peña",
      departamento: "Valle del Cauca",
      ciudad: "Cali",
      vehiculo: "Moto Honda CB160F",
      placa: "CAL21F",
      ciudad_placa: "Cali",
      disponibilidad: "DISPONIBLE",
      created_at: dIso(1800),
      updated_at: dIso(50),
      user: {
        email: "laura.vargas@repartidores.arshop.co",
        full_name: "Laura Vargas Peña",
      },
    },
  ];

  // Pedidos
  const orders: OrderDetail[] = [
    {
      id: "ord-demo-01",
      user_id: "demo-cliente-id",
      status: "SHIPPED",
      total_cop: 264000,
      shipping_cost_cop: 15000,
      currency: "COP",
      shipping_city: "Bogotá",
      shipping_department: "Cundinamarca",
      shipping_phone: "+57 310 987 6543",
      notes: "Timbre 402 en la portería",
      habeas_data_accepted: true,
      stripe_payment_intent_id: "pi_demo_1111",
      created_at: dIso(15),
      paid_at: dIso(14),
      shipped_at: dIso(8),
      delivered_at: null,
      delivery_id: "dom-01",
      delivery_status: "ASSIGNED",
      estimated_delivery_at: new Date(now.getTime() + 45 * 60 * 1000).toISOString(),
      shipping_carrier: "Domiciliario propio ARShop (QR)",
      tracking_number: "AS-BOG-2026-09",
      delivery_confirmation: null,
      receiver_prefilled: {
        nombreReceptor: "Valentina Restrepo",
        tipoDocumento: "CC",
        numeroDocumento: "1020304050",
      },
      shipping_address: {
        recipientName: "Valentina Restrepo",
        line1: "Calle 93B #11A-44, Apto 402",
        neighborhood: "Chicó Norte",
        city: "Bogotá",
        department: "Cundinamarca",
        phone: "+57 310 987 6543",
      },
      items: [
        {
          id: "item-01",
          order_id: "ord-demo-01",
          product_variant_id: "var-01-m",
          product_name_snapshot: "Camisa Oxford Blanco Puro",
          variant_label: "M / Blanco",
          unit_price_cop: 249000,
          quantity: 1,
          created_at: dIso(15),
        },
      ],
    },
    {
      id: "ord-demo-02",
      user_id: "user-test-01",
      status: "PAID",
      total_cop: 384000,
      shipping_cost_cop: 15000,
      currency: "COP",
      shipping_city: "Medellín",
      shipping_department: "Antioquia",
      shipping_phone: "+57 301 234 5678",
      notes: null,
      habeas_data_accepted: true,
      stripe_payment_intent_id: "pi_demo_2222",
      created_at: dIso(35),
      paid_at: dIso(34),
      shipped_at: null,
      delivered_at: null,
      delivery_status: "UNASSIGNED",
      shipping_address: {
        recipientName: "Sofía Castro",
        line1: "Carrera 43A #1-50",
        neighborhood: "El Poblado",
        city: "Medellín",
        department: "Antioquia",
        phone: "+57 301 234 5678",
      },
      items: [
        {
          id: "item-02",
          order_id: "ord-demo-02",
          product_variant_id: "var-03-s",
          product_name_snapshot: "Pantalón Pleated Lana Fría",
          variant_label: "S / 8 / Grafito",
          unit_price_cop: 369000,
          quantity: 1,
          created_at: dIso(35),
        },
      ],
    },
    {
      id: "ord-demo-03",
      user_id: "user-test-02",
      status: "PENDING_PAYMENT",
      total_cop: 154000,
      shipping_cost_cop: 15000,
      currency: "COP",
      shipping_city: "Cali",
      shipping_department: "Valle del Cauca",
      shipping_phone: "+57 315 444 8899",
      notes: "Dejar en recepción",
      habeas_data_accepted: true,
      stripe_payment_intent_id: null,
      created_at: dIso(45),
      paid_at: null,
      shipped_at: null,
      delivered_at: null,
      shipping_address: {
        recipientName: "Felipe Morales",
        line1: "Avenida 6N #22-10",
        neighborhood: "Granada",
        city: "Cali",
        department: "Valle del Cauca",
        phone: "+57 315 444 8899",
      },
      items: [
        {
          id: "item-03",
          order_id: "ord-demo-03",
          product_variant_id: "var-02-l",
          product_name_snapshot: "Camiseta Heavyweight Carbón",
          variant_label: "L / Carbón",
          unit_price_cop: 139000,
          quantity: 1,
          created_at: dIso(45),
        },
      ],
    },
    {
      id: "ord-demo-04",
      user_id: "demo-cliente-id",
      status: "DELIVERED",
      total_cop: 249000,
      shipping_cost_cop: 0,
      currency: "COP",
      shipping_city: "Bogotá",
      shipping_department: "Cundinamarca",
      shipping_phone: "+57 310 987 6543",
      notes: null,
      habeas_data_accepted: true,
      stripe_payment_intent_id: "pi_demo_4444",
      created_at: dIso(600),
      paid_at: dIso(590),
      shipped_at: dIso(540),
      delivered_at: dIso(500),
      delivery_id: "dom-01",
      delivery_status: "ASSIGNED",
      qr_consumed_at: dIso(500),
      delivery_confirmation: "ACCEPTED",
      receiver_prefilled: {
        nombreReceptor: "Valentina Restrepo",
        tipoDocumento: "CC",
        numeroDocumento: "1020304050",
      },
      shipping_address: {
        recipientName: "Valentina Restrepo",
        line1: "Calle 93B #11A-44, Apto 402",
        neighborhood: "Chicó Norte",
        city: "Bogotá",
        department: "Cundinamarca",
        phone: "+57 310 987 6543",
      },
      items: [
        {
          id: "item-04",
          order_id: "ord-demo-04",
          product_variant_id: "var-01-s",
          product_name_snapshot: "Camisa Oxford Blanco Puro",
          variant_label: "S / Blanco",
          unit_price_cop: 249000,
          quantity: 1,
          created_at: dIso(600),
        },
      ],
    },
  ];

  // Disputas de entrega simulada
  const disputes: AdminDispute[] = [
    {
      ...orders[0],
      id: "ord-disputa-01",
      status: "SHIPPED",
      delivery_confirmation: "DISPUTED",
      delivery_disputed_at: dIso(12),
      delivery_dispute_reason:
        "El domiciliario marcó entrega simulada hace 2 horas pero no recibí el paquete ni me llamaron al timbre.",
      customer: {
        email: "demo.cliente@arshop.co",
        full_name: "Valentina Restrepo (Cliente Demo)",
      },
      domiciliario: {
        id: "dom-01",
        nombre_completo: "Carlos Ramírez (Domiciliario Demo)",
        placa: "DEM99G",
        vehiculo: "Moto Yamaha FZ 2.0",
      },
      recibido: [
        {
          nombre_receptor: "Vigilante Edificio",
          tipo_documento: "CC",
          numero_documento: "79450123",
          fuente: "simulacion_pin",
          fecha: new Date().toLocaleDateString("es-CO"),
          hora: "10:15 AM",
        },
      ],
    },
  ];

  // Devoluciones / Retractos (RMA)
  const returns: AdminReturnRow[] = [
    {
      id: "ret-demo-01",
      order_id: "ord-demo-04",
      user_id: "demo-cliente-id",
      type: "SIZE_EXCHANGE",
      status: "REQUESTED",
      reason: "La talla S me quedó ligeramente ajustada en los hombros. Deseo cambiar por talla M.",
      requested_size: "M",
      admin_note: null,
      resolved_by: null,
      resolved_at: null,
      created_at: dIso(30),
      updated_at: dIso(30),
      order: orders[3],
      customer: {
        id: "demo-cliente-id",
        email: "demo.cliente@arshop.co",
        full_name: "Valentina Restrepo (Cliente Demo)",
      },
    },
  ];

  // Bonos del repartidor
  const bonos: DeliveryBono[] = [
    {
      id: "bono-01",
      order_id: "ord-demo-04",
      base_cop: 8000,
      km_extra: 3.5,
      bono_cop: 11500,
      motivo: "Entrega puntual en horario pico (Norte de Bogotá)",
      created_at: dIso(500),
      order: {
        shipping_city: "Bogotá",
        shipping_department: "Cundinamarca",
      },
    },
    {
      id: "bono-02",
      order_id: "ord-demo-old",
      base_cop: 8000,
      km_extra: 6.0,
      bono_cop: 14000,
      motivo: "Entrega extraurbana completada con código QR",
      created_at: dIso(1400),
      order: {
        shipping_city: "Chía",
        shipping_department: "Cundinamarca",
      },
    },
  ];

  // Logs de auditoría
  const auditLogs: AuditLogEntry[] = [
    {
      id: "log-01",
      actor_id: "demo-admin-id",
      action: "AUTH_DEMO_LOGIN",
      target: "demo-admin-id",
      metadata: { role: "ADMIN", ip: "127.0.0.1", note: "Sesión simulada en navegador" },
      created_at: dIso(5),
    },
    {
      id: "log-02",
      actor_id: "demo-admin-id",
      action: "PRODUCT_UPDATE_STOCK",
      target: "demo-prod-01",
      metadata: { variant: "OXF-BLA-M", newStock: 18, prevStock: 12 },
      created_at: dIso(25),
    },
    {
      id: "log-03",
      actor_id: "demo-repartidor-id",
      action: "DELIVERY_ASSIGNED",
      target: "ord-demo-01",
      metadata: { city: "Bogotá", vehicle: "Moto Yamaha FZ 2.0" },
      created_at: dIso(40),
    },
  ];

  return {
    users,
    products,
    orders,
    domiciliarios,
    disputes,
    returns,
    bonos,
    auditLogs,
    deliveryPin: "1234",
  };
}

// ── Gestión del Estado en LocalStorage ─────────────────────────────────────────

export function getDemoState(): DemoState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return null;
    const state: DemoState = JSON.parse(raw);

    // Verificar si ya expiraron los 30 minutos
    if (state.session && state.session.expiresAt <= Date.now()) {
      clearDemoSession();
      return null;
    }

    // Auto-repara la cookie testigo (sesiones creadas antes de que existiera,
    // o si el navegador la borró): sin ella, `proxy.ts` rebotaría /admin.
    if (state.session && !document.cookie.includes(`${DEMO_COOKIE}=1`)) {
      writeDemoGateCookie(
        Math.max(1, Math.ceil((state.session.expiresAt - Date.now()) / 1000)),
      );
    }

    return state;
  } catch {
    return null;
  }
}

export function saveDemoState(state: DemoState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("[DemoStore] Error guardando estado:", err);
  }
}

export function isDemoActive(): boolean {
  const state = getDemoState();
  return Boolean(state && state.session && state.session.expiresAt > Date.now());
}

export function getDemoSession(): DemoSession | null {
  const state = getDemoState();
  return state?.session ?? null;
}

export function getDemoUserProfile(): UserProfile | null {
  const state = getDemoState();
  return state?.session?.user ?? null;
}

/**
 * Cookie testigo del modo demo (`arshop_demo=1`).
 *
 * El sandbox vive en localStorage, que el `proxy.ts` del servidor no puede
 * leer. Esta cookie es lo único que le dice al gate de `/admin` y
 * `/domiciliario` que la visita pertenece a una sesión demo y no a un
 * visitante anónimo. No autentica nada: la demo nunca llama al backend real.
 */
const DEMO_COOKIE = "arshop_demo";

function writeDemoGateCookie(maxAgeSeconds: number) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${DEMO_COOKIE}=1; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secure}`;
}

function clearDemoGateCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${DEMO_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}

export function startDemoSession(
  role: "CUSTOMER" | "ADMIN" | "REPARTIDOR",
): {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: { id: string; email: string };
  role: string;
} {
  const now = Date.now();
  const expiresAt = now + DEMO_TTL_MS;

  const demoProfiles: Record<"CUSTOMER" | "ADMIN" | "REPARTIDOR", UserProfile> = {
    ADMIN: {
      id: "demo-admin-id",
      email: "demo.admin@arshop.co",
      full_name: "Andrés Mendoza (Admin Demo)",
      role: "ADMIN",
      blocked: false,
      created_at: new Date(now - 120 * 60 * 1000).toISOString(),
    },
    REPARTIDOR: {
      id: "demo-repartidor-id",
      email: "demo.repartidor@arshop.co",
      full_name: "Carlos Ramírez (Domiciliario Demo)",
      role: "REPARTIDOR",
      blocked: false,
      created_at: new Date(now - 90 * 60 * 1000).toISOString(),
      phone: "+57 300 123 4567",
    },
    CUSTOMER: {
      id: "demo-cliente-id",
      email: "demo.cliente@arshop.co",
      full_name: "Valentina Restrepo (Cliente Demo)",
      role: "CUSTOMER",
      blocked: false,
      created_at: new Date(now - 60 * 60 * 1000).toISOString(),
      phone: "+57 310 987 6543",
      document_type: "CC",
      document_number: "1020304050",
    },
  };

  const user = demoProfiles[role];
  const current = getDemoState();
  const db = current?.db ?? createInitialDemoDatabase();

  const state: DemoState = {
    session: {
      role,
      startedAt: now,
      expiresAt,
      user,
    },
    db,
  };

  saveDemoState(state);
  // Habilita el paso por `proxy.ts` hacia /admin y /domiciliario.
  writeDemoGateCookie(Math.ceil(DEMO_TTL_MS / 1000));

  return {
    accessToken: "demo-mock-jwt-token",
    refreshToken: "demo-mock-refresh-token",
    expiresAt: Math.floor(expiresAt / 1000),
    user: { id: user.id, email: user.email },
    role,
  };
}

export function resetDemoDatabase() {
  const state = getDemoState();
  if (!state || !state.session) return;
  state.db = createInitialDemoDatabase();
  saveDemoState(state);
}

export function clearDemoSession() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(DEMO_STORAGE_KEY);
  } catch {}
  clearDemoGateCookie();
}

// ── Despachador de Peticiones API en Modo Demo ─────────────────────────────────

export function handleDemoApiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> | undefined {
  const state = getDemoState();
  if (!state || !state.session) return undefined;

  const method = (options.method || "GET").toUpperCase();
  const cleanPath = path.split("?")[0].replace(/\/$/, "");
  const queryStr = path.includes("?") ? path.split("?")[1] : "";
  const params = new URLSearchParams(queryStr);
  const body = options.body ? JSON.parse(options.body as string) : {};

  // 1. /users/me
  if (cleanPath === "/users/me") {
    if (method === "GET") {
      return Promise.resolve(state.session.user as unknown as T);
    }
    if (method === "PATCH") {
      state.session.user = {
        ...state.session.user,
        full_name: body.fullName ?? state.session.user.full_name,
        phone: body.phone ?? state.session.user.phone,
        document_type: body.documentType ?? state.session.user.document_type,
        document_number: body.documentNumber ?? state.session.user.document_number,
      };
      saveDemoState(state);
      return Promise.resolve(state.session.user as unknown as T);
    }
  }

  // 2. /users/me/addresses
  if (cleanPath === "/users/me/addresses") {
    return Promise.resolve([
      {
        id: "addr-demo-01",
        label: "casa",
        recipientName: "Valentina Restrepo",
        line1: "Calle 93B #11A-44, Apto 402",
        neighborhood: "Chicó Norte",
        city: "Bogotá",
        department: "Cundinamarca",
        phone: "+57 310 987 6543",
        isDefault: true,
      },
    ] as unknown as T);
  }

  // 3. /auth/sign-out
  if (cleanPath === "/auth/sign-out") {
    clearDemoSession();
    return Promise.resolve({ ok: true } as unknown as T);
  }

  // 4. /auth/demo-sign-in
  if (cleanPath === "/auth/demo-sign-in") {
    const res = startDemoSession(body.role || "CUSTOMER");
    return Promise.resolve(res as unknown as T);
  }

  // 5. /users (Admin lista de usuarios)
  if (cleanPath === "/users") {
    if (method === "GET") {
      const search = (params.get("search") || "").toLowerCase().trim();
      const roleFilter = params.get("role") || "";
      let rows = [...state.db.users];

      if (roleFilter) {
        rows = rows.filter((u) => u.role === roleFilter);
      }
      if (search) {
        rows = rows.filter(
          (u) =>
            u.email.toLowerCase().includes(search) ||
            (u.full_name && u.full_name.toLowerCase().includes(search)),
        );
      }
      return Promise.resolve({
        rows,
        nextCursor: null,
        hasMore: false,
      } as unknown as T);
    }
    if (method === "POST") {
      const newUser: AdminUserRow = {
        id: `demo-user-${Date.now()}`,
        email: body.email,
        full_name: body.fullName || null,
        role: body.role || "CUSTOMER",
        blocked: false,
        created_at: new Date().toISOString(),
      };
      state.db.users.unshift(newUser);
      saveDemoState(state);
      return Promise.resolve(newUser as unknown as T);
    }
  }

  // /users/bulk
  if (cleanPath === "/users/bulk") {
    const inputUsers = (body.users || []) as Array<{ email: string; fullName?: string; role?: any }>;
    const created: Array<{ id: string; email: string }> = [];
    for (const u of inputUsers) {
      const n: AdminUserRow = {
        id: `demo-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        email: u.email,
        full_name: u.fullName || null,
        role: u.role || "CUSTOMER",
        blocked: false,
        created_at: new Date().toISOString(),
      };
      state.db.users.unshift(n);
      created.push({ id: n.id, email: n.email });
    }
    saveDemoState(state);
    return Promise.resolve({
      created,
      failed: [],
      summary: { total: inputUsers.length, successful: created.length, failed: 0 },
    } as unknown as T);
  }

  // /users/:id/block y /users/:id/unblock
  const userBlockMatch = cleanPath.match(/^\/users\/([^/]+)\/(block|unblock)$/);
  if (userBlockMatch && method === "PATCH") {
    const [, userId, action] = userBlockMatch;
    const u = state.db.users.find((x) => x.id === userId);
    if (u) {
      u.blocked = action === "block";
      saveDemoState(state);
      return Promise.resolve(u as unknown as T);
    }
  }

  // /users/:id (PATCH o DELETE)
  const userSingleMatch = cleanPath.match(/^\/users\/([^/]+)$/);
  if (userSingleMatch) {
    const [, userId] = userSingleMatch;
    if (method === "PATCH") {
      const u = state.db.users.find((x) => x.id === userId);
      if (u) {
        if (body.fullName !== undefined) u.full_name = body.fullName;
        if (body.role !== undefined) u.role = body.role;
        if (body.blocked !== undefined) u.blocked = body.blocked;
        saveDemoState(state);
        return Promise.resolve(u as unknown as T);
      }
    }
    if (method === "DELETE") {
      state.db.users = state.db.users.filter((x) => x.id !== userId);
      saveDemoState(state);
      return Promise.resolve({ ok: true } as unknown as T);
    }
  }

  // 6. /products/admin/list
  if (cleanPath === "/products/admin/list") {
    return Promise.resolve(state.db.products as unknown as T);
  }

  // /products/admin/search
  if (cleanPath === "/products/admin/search") {
    const q = (params.get("q") || "").toLowerCase().trim();
    const results = state.db.products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q),
    );
    return Promise.resolve({
      query: q,
      total: results.length,
      tookMs: 12,
      source: "demo_memory",
      results,
    } as unknown as T);
  }

  // /products/admin/export/json
  if (cleanPath === "/products/admin/export/json") {
    return Promise.resolve({
      exportedAt: new Date().toISOString(),
      source: "demo_memory",
      total: state.db.products.length,
      products: state.db.products,
    } as unknown as T);
  }

  // /products/admin/:id
  const prodAdminDetail = cleanPath.match(/^\/products\/admin\/([^/]+)$/);
  if (prodAdminDetail && method === "GET") {
    const [, prodId] = prodAdminDetail;
    const p = state.db.products.find((x) => x.id === prodId || x.slug === prodId);
    return Promise.resolve((p ?? state.db.products[0]) as unknown as T);
  }

  // /products (Admin POST)
  if (cleanPath === "/products" && method === "POST") {
    const newP: AdminProduct = {
      id: `demo-prod-${Date.now()}`,
      slug: body.slug || `producto-${Date.now()}`,
      name: body.name || "Nuevo Producto Demo",
      brand: body.brand || "ARShop Atelier",
      price: Number(body.priceCop || 150000),
      currency: "COP",
      gender: body.gender || "hombre",
      category: body.category || "camisas",
      images: body.images?.length ? body.images : [
        "https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=800&h=1000&fit=crop&q=80",
      ],
      colors: [{ name: "Único", hex: "#111111" }],
      sizes: (body.variants || []).map((v: any) => v.size) || ["M"],
      description: body.description || "",
      active: body.active !== undefined ? body.active : true,
      compareAtPrice: body.compareAtPriceCop ? Number(body.compareAtPriceCop) : null,
      fit: body.fit || "regular",
      variants: (body.variants || []).map((v: any, idx: number) => ({
        id: `var-new-${idx}`,
        sku: v.sku || `SKU-${idx}`,
        size: v.size || "M",
        stock: Number(v.stock || 10),
        color_name: v.colorName || "Único",
        color_hex: v.colorHex || "#111111",
      })),
    };
    state.db.products.unshift(newP);
    saveDemoState(state);
    return Promise.resolve(newP as unknown as T);
  }

  // /products/:id (PATCH o DELETE)
  const prodSingleMatch = cleanPath.match(/^\/products\/([^/]+)$/);
  if (prodSingleMatch) {
    const [, prodId] = prodSingleMatch;
    if (method === "PATCH") {
      const p = state.db.products.find((x) => x.id === prodId);
      if (p) {
        if (body.name !== undefined) p.name = body.name;
        if (body.priceCop !== undefined) p.price = Number(body.priceCop);
        if (body.active !== undefined) p.active = body.active;
        if (body.description !== undefined) p.description = body.description;
        if (body.variants) {
          p.variants = body.variants.map((v: any, i: number) => ({
            id: v.id || `var-${i}`,
            sku: v.sku,
            size: v.size,
            stock: Number(v.stock || 0),
            color_name: v.colorName || "Color",
            color_hex: v.colorHex || "#111",
          }));
        }
        saveDemoState(state);
        return Promise.resolve(p as unknown as T);
      }
    }
    if (method === "DELETE") {
      state.db.products = state.db.products.filter((x) => x.id !== prodId);
      saveDemoState(state);
      return Promise.resolve({ ok: true, archived: false } as unknown as T);
    }
  }

  // /uploads/product-image/sign
  if (cleanPath === "/uploads/product-image/sign" && method === "POST") {
    return Promise.resolve({
      signedUrl: "about:blank",
      token: "demo-token",
      path: "demo-image.jpg",
      publicUrl: "https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=800&h=1000&fit=crop&q=80",
      maxSizeBytes: 5242880,
      allowedTypes: ["image/jpeg", "image/png", "image/webp"],
    } as unknown as T);
  }

  // 7. /orders/mine (Pedidos del cliente autenticado)
  if (cleanPath === "/orders/mine") {
    const myOrders = state.db.orders.filter(
      (o) => o.user_id === state.session?.user.id,
    );
    return Promise.resolve(myOrders as unknown as T);
  }

  // /orders (Admin lista de pedidos)
  if (cleanPath === "/orders" && method === "GET") {
    return Promise.resolve(state.db.orders as unknown as T);
  }

  // /orders/:id
  const orderSingleMatch = cleanPath.match(/^\/orders\/([^/]+)$/);
  if (orderSingleMatch && method === "GET") {
    const [, orderId] = orderSingleMatch;
    const o = state.db.orders.find((x) => x.id === orderId);
    return Promise.resolve((o ?? state.db.orders[0]) as unknown as T);
  }

  // /orders/:id/ship
  const orderShipMatch = cleanPath.match(/^\/orders\/([^/]+)\/ship$/);
  if (orderShipMatch && method === "PATCH") {
    const [, orderId] = orderShipMatch;
    const o = state.db.orders.find((x) => x.id === orderId);
    if (o) {
      o.status = "SHIPPED";
      o.shipped_at = new Date().toISOString();
      if (body.carrier) o.shipping_carrier = body.carrier;
      if (body.trackingNumber) o.tracking_number = body.trackingNumber;
      if (body.trackingUrl) o.tracking_url = body.trackingUrl;
      saveDemoState(state);
      return Promise.resolve(o as unknown as T);
    }
  }

  // /orders/:id/deliver
  const orderDeliverMatch = cleanPath.match(/^\/orders\/([^/]+)\/deliver$/);
  if (orderDeliverMatch && method === "PATCH") {
    const [, orderId] = orderDeliverMatch;
    const o = state.db.orders.find((x) => x.id === orderId);
    if (o) {
      o.status = "DELIVERED";
      o.delivered_at = new Date().toISOString();
      saveDemoState(state);
      return Promise.resolve(o as unknown as T);
    }
  }

  // /orders/:id/cancel
  const orderCancelMatch = cleanPath.match(/^\/orders\/([^/]+)\/cancel$/);
  if (orderCancelMatch && method === "POST") {
    const [, orderId] = orderCancelMatch;
    const o = state.db.orders.find((x) => x.id === orderId);
    if (o) {
      o.status = "CANCELLED";
      saveDemoState(state);
      return Promise.resolve(o as unknown as T);
    }
  }

  // /payments/dev/simulate-paid/:id
  const orderSimulatePaid = cleanPath.match(/^\/payments\/dev\/simulate-paid\/([^/]+)$/);
  if (orderSimulatePaid && method === "POST") {
    const [, orderId] = orderSimulatePaid;
    const o = state.db.orders.find((x) => x.id === orderId);
    if (o) {
      o.status = "PAID";
      o.paid_at = new Date().toISOString();
      saveDemoState(state);
      return Promise.resolve({ ok: true, orderId, status: "PAID" } as unknown as T);
    }
  }

  // /orders/:id/assign-delivery
  const orderAssignDelivery = cleanPath.match(/^\/orders\/([^/]+)\/assign-delivery$/);
  if (orderAssignDelivery && method === "POST") {
    const [, orderId] = orderAssignDelivery;
    const o = state.db.orders.find((x) => x.id === orderId);
    if (o) {
      o.delivery_id = body.domiciliarioId || "dom-01";
      o.delivery_status = "ASSIGNED";
      o.estimated_delivery_at = new Date(Date.now() + 40 * 60 * 1000).toISOString();
      saveDemoState(state);
      return Promise.resolve(o as unknown as T);
    }
  }

  // /orders/:id/qr
  const orderQrMatch = cleanPath.match(/^\/orders\/([^/]+)\/qr$/);
  if (orderQrMatch && method === "GET") {
    const [, orderId] = orderQrMatch;
    const o = state.db.orders.find((x) => x.id === orderId);
    // Igual que el backend: el QR queda "consumido" en cuanto el repartidor lo
    // escanea, aunque el pedido todavía no esté en DELIVERED.
    const consumed = Boolean(o?.qr_consumed_at);
    // Generar SVG Data URI para el QR sin dependencias externas
    const qrSvg = encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300"><rect width="100" height="100" fill="#ffffff"/><path d="M10 10h30v30h-30zM50 10h10v10h-10zM70 10h20v20h-20zM10 50h10v10h-10zM10 70h30v20h-30zM50 50h40v40h-40z" fill="#111111"/></svg>`,
    );
    const payload: OrderQrPayload = {
      consumed,
      consumedAt: o?.qr_consumed_at || undefined,
      token: `demo-qr-token-${orderId}`,
      dataUrl: `data:image/svg+xml;utf8,${qrSvg}`,
      exp: Math.floor((Date.now() + 600000) / 1000),
      clientCode: "4829",
      clientCodeExp: Math.floor((Date.now() + 600000) / 1000),
      estimatedDeliveryAt: o?.estimated_delivery_at || new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      deliveryWarning: null,
      deliveryStatus: o?.delivery_status || "ASSIGNED",
      // Mismo dato que devuelve el backend real: la pantalla del cliente lo
      // usa para precargar el formulario y avisar si aún no guardó a quién
      // entrega.
      receiverPrefilled: o?.receiver_prefilled ?? null,
    };
    return Promise.resolve(payload as unknown as T);
  }

  // /orders/:id/receiver-data
  const orderReceiverData = cleanPath.match(/^\/orders\/([^/]+)\/receiver-data$/);
  if (orderReceiverData && method === "POST") {
    const [, orderId] = orderReceiverData;
    const o = state.db.orders.find((x) => x.id === orderId);
    if (o) {
      o.receiver_prefilled = {
        nombreReceptor: body.nombreReceptor ?? "",
        tipoDocumento: body.tipoDocumento ?? "CC",
        numeroDocumento: body.numeroDocumento ?? "",
      };
      saveDemoState(state);
    }
    return Promise.resolve({ ok: true } as unknown as T);
  }

  // /orders/:id/confirm-delivery (Cliente confirma)
  const orderConfirmClient = cleanPath.match(/^\/orders\/([^/]+)\/confirm-delivery$/);
  if (orderConfirmClient && method === "POST") {
    const [, orderId] = orderConfirmClient;
    const o = state.db.orders.find((x) => x.id === orderId);
    if (o) {
      o.delivery_confirmation = "ACCEPTED";
      o.status = "DELIVERED";
      o.delivered_at = new Date().toISOString();
      saveDemoState(state);
      return Promise.resolve(o as unknown as T);
    }
  }

  // /orders/:id/dispute-delivery
  const orderDispute = cleanPath.match(/^\/orders\/([^/]+)\/dispute-delivery$/);
  if (orderDispute && method === "POST") {
    const [, orderId] = orderDispute;
    const o = state.db.orders.find((x) => x.id === orderId);
    if (o) {
      o.delivery_confirmation = "DISPUTED";
      o.delivery_dispute_reason = body.reason || "Reporte de problema con la entrega";
      o.delivery_disputed_at = new Date().toISOString();
      saveDemoState(state);
      return Promise.resolve(o as unknown as T);
    }
  }

  // /orders/:id/returns
  const orderReturn = cleanPath.match(/^\/orders\/([^/]+)\/returns$/);
  if (orderReturn && method === "POST") {
    const [, orderId] = orderReturn;
    const ret: AdminReturnRow = {
      id: `ret-new-${Date.now()}`,
      order_id: orderId,
      user_id: state.session.user.id,
      type: body.type || "SIZE_EXCHANGE",
      status: "REQUESTED",
      reason: body.reason || "Solicitud de cambio",
      requested_size: body.requestedSize || null,
      admin_note: null,
      resolved_by: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      order: state.db.orders.find((x) => x.id === orderId) || null,
      customer: {
        id: state.session.user.id,
        email: state.session.user.email,
        full_name: state.session.user.full_name || null,
      },
    };
    state.db.returns.unshift(ret);
    saveDemoState(state);
    return Promise.resolve(ret as unknown as T);
  }

  // 8. /admin/orders/disputed
  if (cleanPath === "/admin/orders/disputed") {
    const resolved = params.get("resolved") === "1";
    const res = state.db.disputes.filter((d) =>
      resolved ? Boolean(d.delivery_dispute_resolution) : !d.delivery_dispute_resolution,
    );
    return Promise.resolve(res as unknown as T);
  }

  // /admin/orders/:id/resolve-dispute
  const resolveDisputeMatch = cleanPath.match(/^\/admin\/orders\/([^/]+)\/resolve-dispute$/);
  if (resolveDisputeMatch && method === "POST") {
    const [, orderId] = resolveDisputeMatch;
    const d = state.db.disputes.find((x) => x.id === orderId);
    if (d) {
      d.delivery_dispute_resolution = body.decision === "REFUND" ? "REFUNDED" : "FORCED_ACCEPTED";
      d.delivery_dispute_resolved_at = new Date().toISOString();
      d.delivery_dispute_resolution_note = body.note || null;
      d.status = body.decision === "REFUND" ? "CANCELLED" : "DELIVERED";
      saveDemoState(state);
      return Promise.resolve(d as unknown as T);
    }
  }

  // 9. /admin/orders/returns
  if (cleanPath === "/admin/orders/returns") {
    const resolved = params.get("resolved") === "1";
    const res = state.db.returns.filter((r) =>
      resolved ? r.status !== "REQUESTED" : r.status === "REQUESTED",
    );
    return Promise.resolve(res as unknown as T);
  }

  // /admin/orders/:id/resolve-return
  const resolveReturnMatch = cleanPath.match(/^\/admin\/orders\/([^/]+)\/resolve-return$/);
  if (resolveReturnMatch && method === "POST") {
    const [, orderId] = resolveReturnMatch;
    const r = state.db.returns.find((x) => x.order_id === orderId || x.id === orderId);
    if (r) {
      r.status =
        body.decision === "APPROVE_REFUND"
          ? "APPROVED_REFUNDED"
          : body.decision === "APPROVE_EXCHANGE"
            ? "APPROVED_EXCHANGED"
            : "REJECTED";
      r.admin_note = body.note || null;
      r.resolved_at = new Date().toISOString();
      saveDemoState(state);
      return Promise.resolve(r as unknown as T);
    }
  }

  // 10. /admin/deliveries (Domiciliarios para el Admin)
  if (cleanPath === "/admin/deliveries") {
    if (method === "GET") {
      return Promise.resolve(state.db.domiciliarios as unknown as T);
    }
    if (method === "POST") {
      const newD: Domiciliario & { user?: { email: string; full_name: string | null } } = {
        id: `dom-${Date.now()}`,
        user_id: `user-${Date.now()}`,
        nombre_completo: body.nombreCompleto || "Nuevo Domiciliario",
        departamento: body.departamento || "Cundinamarca",
        ciudad: body.ciudad || "Bogotá",
        vehiculo: body.vehiculo || "Moto",
        placa: (body.placa || "ABC12D").toUpperCase(),
        ciudad_placa: body.ciudadPlaca || "Bogotá",
        disponibilidad: body.disponibilidad || "DISPONIBLE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user: {
          email: body.email || `repartidor.${Date.now()}@arshop.co`,
          full_name: body.nombreCompleto || "Nuevo Domiciliario",
        },
      };
      state.db.domiciliarios.unshift(newD);
      saveDemoState(state);
      return Promise.resolve(newD as unknown as T);
    }
  }

  // /admin/deliveries/:id (PATCH o DELETE)
  const deliverySingleMatch = cleanPath.match(/^\/admin\/deliveries\/([^/]+)$/);
  if (deliverySingleMatch) {
    const [, domId] = deliverySingleMatch;
    if (method === "PATCH") {
      const d = state.db.domiciliarios.find((x) => x.id === domId);
      if (d) {
        if (body.nombreCompleto) d.nombre_completo = body.nombreCompleto;
        if (body.departamento) d.departamento = body.departamento;
        if (body.ciudad) d.ciudad = body.ciudad;
        if (body.vehiculo) d.vehiculo = body.vehiculo;
        if (body.placa) d.placa = body.placa.toUpperCase();
        if (body.ciudadPlaca) d.ciudad_placa = body.ciudadPlaca;
        if (body.disponibilidad) d.disponibilidad = body.disponibilidad;
        d.updated_at = new Date().toISOString();
        saveDemoState(state);
        return Promise.resolve(d as unknown as T);
      }
    }
    if (method === "DELETE") {
      state.db.domiciliarios = state.db.domiciliarios.filter((x) => x.id !== domId);
      saveDemoState(state);
      return Promise.resolve({ ok: true } as unknown as T);
    }
  }

  // 11. /delivery/mine/profile (Panel Repartidor)
  if (cleanPath === "/delivery/mine/profile") {
    if (method === "GET") {
      const p = state.db.domiciliarios[0];
      return Promise.resolve(p as unknown as T);
    }
    if (method === "PATCH") {
      const d = state.db.domiciliarios[0];
      if (body.vehiculo) d.vehiculo = body.vehiculo;
      if (body.placa) d.placa = body.placa.toUpperCase();
      if (body.ciudadPlaca) d.ciudad_placa = body.ciudadPlaca;
      if (body.disponibilidad) d.disponibilidad = body.disponibilidad;
      d.updated_at = new Date().toISOString();
      saveDemoState(state);
      return Promise.resolve(d as unknown as T);
    }
  }

  // /delivery/mine/orders
  if (cleanPath === "/delivery/mine/orders") {
    const statusFilter = params.get("status");
    let domOrders: DeliveryOrder[] = state.db.orders.map((o) => ({
      ...o,
      estimated_delivery_at: o.estimated_delivery_at ?? null,
      delivery_status: o.delivery_status ?? null,
      delivery_warning: o.delivery_warning ?? null,
      qr_consumed_at: o.qr_consumed_at ?? null,
      receiver_prefilled: o.receiver_prefilled ?? null,
      customer: {
        email: "demo.cliente@arshop.co",
        full_name: "Valentina Restrepo",
      },
    }));
    if (statusFilter) {
      domOrders = domOrders.filter((o) => o.status === statusFilter);
    }
    return Promise.resolve(domOrders as unknown as T);
  }

  // /delivery/mine/orders/:id
  const domOrderSingle = cleanPath.match(/^\/delivery\/mine\/orders\/([^/]+)$/);
  if (domOrderSingle && method === "GET") {
    const [, orderId] = domOrderSingle;
    const o = state.db.orders.find((x) => x.id === orderId) || state.db.orders[0];
    const res: DeliveryOrder = {
      ...o,
      estimated_delivery_at: o.estimated_delivery_at ?? null,
      delivery_status: o.delivery_status ?? null,
      delivery_warning: o.delivery_warning ?? null,
      qr_consumed_at: o.qr_consumed_at ?? null,
      receiver_prefilled: o.receiver_prefilled ?? null,
      customer: {
        email: "demo.cliente@arshop.co",
        full_name: "Valentina Restrepo",
      },
    };
    return Promise.resolve(res as unknown as T);
  }

  // /delivery/mine/orders/:id/client-info
  const domClientInfo = cleanPath.match(/^\/delivery\/mine\/orders\/([^/]+)\/client-info$/);
  if (domClientInfo && method === "GET") {
    return Promise.resolve({
      fullName: "Valentina Restrepo",
      documentType: "CC",
      documentNumber: "1020304050",
    } as unknown as T);
  }

  // /delivery/mine/bonos
  if (cleanPath === "/delivery/mine/bonos") {
    return Promise.resolve(state.db.bonos as unknown as T);
  }

  // /delivery/mine/pin
  if (cleanPath === "/delivery/mine/pin" && method === "POST") {
    state.db.deliveryPin = body.pin || "1234";
    saveDemoState(state);
    return Promise.resolve({ ok: true } as unknown as T);
  }

  // /delivery/scan-qr
  if (cleanPath === "/delivery/scan-qr" && method === "POST") {
    // En el flujo real el QR consume la orden y trae los datos de receptor que
    // el cliente diligenció. Si el demo no los marcara, el repartidor vería el
    // botón de "simular" después de escanear — justo el atajo que se eliminó.
    const o =
      state.db.orders.find((x) => x.delivery_id === "dom-01") ??
      state.db.orders[0];
    if (o) {
      o.qr_consumed_at = new Date().toISOString();
      o.receiver_prefilled = o.receiver_prefilled ?? {
        nombreReceptor: o.shipping_address?.recipientName ?? "Valentina Restrepo",
        tipoDocumento: "CC",
        numeroDocumento: "1020304050",
      };
      saveDemoState(state);
      return Promise.resolve({
        ok: true,
        orderId: o.id,
        needsReceiverData: false,
        prefill: o.receiver_prefilled,
        qrConsumed: true,
      } as unknown as T);
    }
  }

  // /delivery/verify-code (sin orderId): el repartidor escribe el código que
  // el cliente le dicta y el demo resuelve la entrega activa asignada.
  if (cleanPath === "/delivery/verify-code" && method === "POST") {
    const o =
      state.db.orders.find(
        (x) => x.delivery_id === "dom-01" && x.status !== "DELIVERED",
      ) ?? state.db.orders[0];
    if (o) {
      o.qr_consumed_at = new Date().toISOString();
      o.receiver_prefilled = o.receiver_prefilled ?? {
        nombreReceptor:
          o.shipping_address?.recipientName ?? "Valentina Restrepo",
        tipoDocumento: "CC",
        numeroDocumento: "1020304050",
      };
      saveDemoState(state);
    }
    return Promise.resolve({
      ok: true,
      orderId: o?.id,
      needsReceiverData: false,
      prefill: o?.receiver_prefilled ?? null,
    } as unknown as T);
  }

  // /delivery/verify-code/:id
  const domVerifyCode = cleanPath.match(/^\/delivery\/verify-code\/([^/]+)$/);
  if (domVerifyCode && method === "POST") {
    const [, orderId] = domVerifyCode;
    const o = state.db.orders.find((x) => x.id === orderId);
    if (o) {
      o.qr_consumed_at = new Date().toISOString();
      o.receiver_prefilled = o.receiver_prefilled ?? {
        nombreReceptor: o.shipping_address?.recipientName ?? "Valentina Restrepo",
        tipoDocumento: "CC",
        numeroDocumento: "1020304050",
      };
      saveDemoState(state);
    }
    return Promise.resolve({
      ok: true,
      orderId,
      needsReceiverData: false,
      prefill: o?.receiver_prefilled ?? null,
    } as unknown as T);
  }

  // /delivery/confirm/:id
  const domConfirm = cleanPath.match(/^\/delivery\/confirm\/([^/]+)$/);
  if (domConfirm && method === "POST") {
    const [, orderId] = domConfirm;
    const o = state.db.orders.find((x) => x.id === orderId);
    if (o) {
      o.status = "DELIVERED";
      o.delivered_at = new Date().toISOString();
      o.delivery_confirmation = "ACCEPTED";
      saveDemoState(state);
      return Promise.resolve(o as unknown as T);
    }
  }

  // /delivery/simulate/:id
  const domSimulate = cleanPath.match(/^\/delivery\/simulate\/([^/]+)$/);
  if (domSimulate && method === "POST") {
    const [, orderId] = domSimulate;
    const o = state.db.orders.find((x) => x.id === orderId);
    if (o) {
      // Mismo guard que el backend: con QR o código ya validado no hay nada
      // que simular; el pedido se cierra marcándolo como entregado.
      if (o.qr_consumed_at) {
        return Promise.reject(
          new Error(
            "El cliente ya validó el QR o su código. Marca la entrega como entregada; no hace falta simularla.",
          ),
        ) as unknown as Promise<T>;
      }
      o.status = "SHIPPED";
      o.delivery_confirmation = "PENDING_CLIENT";
      o.delivery_simulated_at = new Date().toISOString();
      // Espeja la ventana real: recordatorio a las 24 h, disputa a las 48 h.
      o.delivery_reminder_at = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      o.delivery_reminder_sent_at = null;
      o.delivery_auto_confirm_at = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
      saveDemoState(state);
      return Promise.resolve(o as unknown as T);
    }
  }

  // 12. /audit-logs
  if (cleanPath === "/audit-logs") {
    return Promise.resolve({
      rows: state.db.auditLogs,
      nextCursor: null,
      hasMore: false,
    } as unknown as T);
  }

  // 13. Notificaciones push y otros
  if (cleanPath.startsWith("/push/")) {
    return Promise.resolve({ enabled: false, publicKey: null, ok: true } as unknown as T);
  }

  // 14. MFA
  //
  // El modo demo no tiene una cuenta real ni un secreto TOTP que vincular.
  // Antes TODA ruta /auth/mfa/* devolvía el mismo objeto, así que al pedir el
  // setup el frontend recibía `id`/`secret`/`qrCode` en `undefined` y abría el
  // modal con el QR y el secreto en blanco. Ahora cada endpoint responde lo que
  // de verdad puede ofrecer una sesión simulada.
  if (cleanPath === "/auth/mfa/factors") {
    // Sin factores: el panel se pinta como "verificación desactivada".
    return Promise.resolve({ factors: [], totp: null } as unknown as T);
  }

  if (cleanPath === "/auth/mfa/backup-codes/count") {
    return Promise.resolve({ count: 0 } as unknown as T);
  }

  if (cleanPath === "/auth/mfa/totp/setup") {
    return Promise.reject(
      new Error("Debes iniciar sesión para usar este QR"),
    ) as unknown as Promise<T>;
  }

  if (cleanPath.startsWith("/auth/mfa/")) {
    return Promise.reject(
      new Error("Esta acción requiere una cuenta real"),
    ) as unknown as Promise<T>;
  }

  // Si la petición es de escritura (POST, PUT, PATCH, DELETE) y no cayó en un handler explícito:
  // interceptamos para proteger la base de datos real contra escrituras accidentales.
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    console.log(`[DemoStore] Acción simulada interceptada: ${method} ${path}`);
    return Promise.resolve({ ok: true, simulated: true } as unknown as T);
  }

  // Para lecturas (GET) no mapeadas, dejamos que siga al backend o devuelva undefined
  return undefined;
}
