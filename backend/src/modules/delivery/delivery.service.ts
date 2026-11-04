import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { ConfigService } from "@nestjs/config";
import { SupabaseService } from "../../supabase/supabase.service";
import { QrService } from "../qr/qr.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { PushService } from "../push/push.service";
import { ensureDomiciliarioRow } from "./delivery-provisioning";
import type {
  ScanQrDto,
  SetPinDto,
  SimulateDeliveryDto,
  UpdateDeliveryProfileDto,
} from "./dto/scan-qr.dto";
import type {
  CreateDomiciliarioDto,
  UpdateDomiciliarioDto,
} from "./dto/admin-delivery.dto";

const scrypt = promisify(_scrypt);
const PIN_LOCKOUT_ATTEMPTS = 5;
const PIN_LOCKOUT_MINUTES = 15;

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly qr: QrService,
    private readonly audit: AuditLogsService,
    private readonly push: PushService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Devuelve nombre + documento del titular para que el repartidor pueda
   * autorellenar el modal de simulación.
   */
  async getClientInfo(userId: string, orderId: string) {
    const dom = await this.requireMyDomiciliario(userId);
    const { data: order } = await this.supabase.admin
      .from("orders")
      .select("id, delivery_id, user_id")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) throw new NotFoundException("Orden no encontrada");
    if (order.delivery_id !== dom.id) {
      throw new ForbiddenException("Orden no asignada a ti");
    }

    const { data: profile } = await this.supabase.admin
      .from("profiles")
      .select("full_name, document_type, document_number")
      .eq("id", order.user_id)
      .maybeSingle();

    return {
      fullName: profile?.full_name ?? null,
      documentType: profile?.document_type ?? null,
      documentNumber: profile?.document_number ?? null,
    };
  }

  // ───────────────────── Lookup del domiciliario por userId ─────────────────────
  async requireMyDomiciliario(userId: string) {
    const { data, error } = await this.supabase.admin
      .from("domiciliarios")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    // El rol ya está validado por @Roles("REPARTIDOR") + el guard (que lee
    // profiles.role en cada request). Si falta la ficha operativa la creamos
    // aquí en lugar de romper el panel con un 404: así promover el rol desde
    // SQL o desde el panel admin funciona igual.
    if (!data) return ensureDomiciliarioRow(this.supabase.admin, userId);
    return data;
  }

  // ───────────────────── Perfil propio ─────────────────────
  async getProfile(userId: string) {
    return this.requireMyDomiciliario(userId);
  }

  async updateProfile(userId: string, dto: UpdateDeliveryProfileDto) {
    const dom = await this.requireMyDomiciliario(userId);
    const patch: Record<string, unknown> = {};
    if (dto.nombreCompleto !== undefined) patch.nombre_completo = dto.nombreCompleto;
    if (dto.departamento !== undefined) patch.departamento = dto.departamento;
    if (dto.ciudad !== undefined) patch.ciudad = dto.ciudad;
    if (dto.vehiculo !== undefined) patch.vehiculo = dto.vehiculo;
    if (dto.placa !== undefined) patch.placa = dto.placa;
    if (dto.ciudadPlaca !== undefined) patch.ciudad_placa = dto.ciudadPlaca;
    if (dto.disponibilidad !== undefined) patch.disponibilidad = dto.disponibilidad;

    const { data, error } = await this.supabase.admin
      .from("domiciliarios")
      .update(patch)
      .eq("id", dom.id)
      .select()
      .single();
    if (error) throw error;

    if (dto.disponibilidad === "DISPONIBLE") {
      this.retryUnassignedOrdersForDepartment(data.departamento).catch((e) =>
        this.logger.warn(
          `retryUnassignedOrdersForDepartment falló: ${(e as Error).message}`,
        ),
      );
    }

    return data;
  }

  // ───────────────────── Órdenes ─────────────────────
  async listMyOrders(userId: string, status?: string) {
    if (status === "PENDING_PAYMENT") return [];
    const dom = await this.requireMyDomiciliario(userId);
    let q = this.supabase.admin
      .from("orders")
      .select(
        "id, user_id, status, total_cop, currency, shipping_address, shipping_city, shipping_department, shipping_phone, estimated_delivery_at, delivery_status, delivery_warning, delivery_confirmation, delivery_simulated_at, qr_consumed_at, created_at, paid_at, shipped_at, delivered_at, receiver_prefilled, items:order_items(product_name_snapshot, variant_label, quantity, unit_price_cop)",
      )
      .eq("delivery_id", dom.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (status) {
      q = q.eq("status", status);
    } else {
      q = q.in("status", ["PAID", "SHIPPED", "DELIVERED", "CANCELLED"]);
    }
    const { data, error } = await q;
    if (error) throw error;
    const rows = data ?? [];
    return this.attachCustomer(rows);
  }

  async getMyOrder(userId: string, orderId: string) {
    const dom = await this.requireMyDomiciliario(userId);
    const { data, error } = await this.supabase.admin
      .from("orders")
      .select(
        "*, items:order_items(*), recibido:recibido(nombre_receptor, tipo_documento, numero_documento, fuente, hora, fecha)",
      )
      .eq("id", orderId)
      .eq("delivery_id", dom.id)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.status === "PENDING_PAYMENT") {
      throw new NotFoundException("Orden no asignada a ti");
    }
    const [withCustomer] = await this.attachCustomer([data]);
    return withCustomer;
  }

  /**
   * Empalma datos del titular en memoria porque orders.user_id apunta a
   * auth.users (sin FK directa con profiles — PostgREST no puede joinear).
   */
  private async attachCustomer<T extends { user_id: string }>(rows: T[]) {
    if (rows.length === 0) return rows as Array<T & { customer: null }>;
    const ids = Array.from(new Set(rows.map((r) => r.user_id)));
    const { data: profiles } = await this.supabase.admin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", ids);
    const byId = new Map(
      (profiles ?? []).map((p) => [p.id, { email: p.email, full_name: p.full_name }]),
    );
    return rows.map((r) => ({
      ...r,
      customer: byId.get(r.user_id) ?? null,
    }));
  }

  // ───────────────────── Bonos ─────────────────────
  async listMyBonos(userId: string) {
    const dom = await this.requireMyDomiciliario(userId);
    const { data, error } = await this.supabase.admin
      .from("delivery_bonos")
      .select("*, order:orders(shipping_city, shipping_department)")
      .eq("domiciliario_id", dom.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  // ───────────────────── PIN ─────────────────────
  async setPin(userId: string, dto: SetPinDto) {
    const dom = await this.requireMyDomiciliario(userId);

    const { data: existing } = await this.supabase.admin
      .from("delivery_pin")
      .select("pin_hash")
      .eq("domiciliario_id", dom.id)
      .maybeSingle();

    if (existing && !dto.currentPin) {
      throw new BadRequestException("Debes proporcionar el PIN actual");
    }
    if (existing && dto.currentPin) {
      const ok = await this.verifyPin(existing.pin_hash, dto.currentPin);
      if (!ok) throw new UnauthorizedException("PIN actual incorrecto");
    }

    const hash = await this.hashPin(dto.pin);
    const { error } = await this.supabase.admin
      .from("delivery_pin")
      .upsert({
        domiciliario_id: dom.id,
        pin_hash: hash,
        failed_attempts: 0,
        locked_until: null,
      });
    if (error) throw error;
    return { ok: true };
  }

  private async requireValidPin(domiciliarioId: string, pin: string) {
    const { data: row } = await this.supabase.admin
      .from("delivery_pin")
      .select("pin_hash, failed_attempts, locked_until")
      .eq("domiciliario_id", domiciliarioId)
      .maybeSingle();
    if (!row) throw new BadRequestException("Debes configurar un PIN primero");

    if (row.locked_until && new Date(row.locked_until) > new Date()) {
      throw new ForbiddenException(
        "PIN bloqueado por demasiados intentos. Intenta más tarde.",
      );
    }
    const ok = await this.verifyPin(row.pin_hash, pin);
    if (!ok) {
      const nextAttempts = (row.failed_attempts ?? 0) + 1;
      const patch: Record<string, unknown> = { failed_attempts: nextAttempts };
      if (nextAttempts >= PIN_LOCKOUT_ATTEMPTS) {
        patch.locked_until = new Date(
          Date.now() + PIN_LOCKOUT_MINUTES * 60_000,
        ).toISOString();
        patch.failed_attempts = 0;
      }
      await this.supabase.admin
        .from("delivery_pin")
        .update(patch)
        .eq("domiciliario_id", domiciliarioId);
      throw new UnauthorizedException("PIN incorrecto");
    }
    if ((row.failed_attempts ?? 0) > 0) {
      await this.supabase.admin
        .from("delivery_pin")
        .update({ failed_attempts: 0, locked_until: null })
        .eq("domiciliario_id", domiciliarioId);
    }
  }

  private async hashPin(pin: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = (await scrypt(pin, salt, 32)) as Buffer;
    return `${salt.toString("hex")}.${derived.toString("hex")}`;
  }

  private async verifyPin(stored: string, pin: string): Promise<boolean> {
    // Siempre derivamos la clave antes de decidir, aunque `stored` esté
    // vacío o corrupto — así el tiempo de respuesta no filtra información
    // sobre el estado del registro en DB.
    const [saltHex, hashHex] = (stored ?? "").split(".");
    const salt =
      saltHex && saltHex.length > 0
        ? Buffer.from(saltHex, "hex")
        : Buffer.alloc(16);
    const derived = (await scrypt(pin, salt, 32)) as Buffer;

    if (!saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, "hex");
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  }

  // ───────────────────── Verificar código 4 dígitos ─────────────────────
  /**
   * Variante sin `orderId`: el repartidor escucha el código y lo escribe en el
   * escáner, donde no hay una orden seleccionada. La orden se resuelve entre
   * las entregas activas asignadas a él comparando el hash, que incluye el id
   * de la orden — por construcción un código sólo puede coincidir con una.
   *
   * Aquí no se incrementan contadores de fallo porque un intento errado no se
   * puede atribuir a una orden concreta; el throttler del controlador
   * (10/min) y el TTL corto del código acotan la fuerza bruta. La ruta con
   * `orderId` conserva el lockout por orden.
   */
  async verifyClientCodeAnywhere(userId: string, code: string) {
    const dom = await this.requireMyDomiciliario(userId);

    const { data, error } = await this.supabase.admin
      .from("orders")
      .select("id, client_code_hash, client_code_exp")
      .eq("delivery_id", dom.id)
      .in("status", ["PAID", "SHIPPED"])
      .is("qr_consumed_at", null);
    if (error) throw error;

    const now = Date.now();
    const match = (data ?? []).find((row) => {
      if (!row.client_code_hash || !row.client_code_exp) return false;
      if (new Date(row.client_code_exp).getTime() <= now) return false;
      return row.client_code_hash === this.qr.hashClientCode(row.id, code);
    });

    if (!match) {
      throw new UnauthorizedException(
        "Código inválido o expirado. Pide al cliente que lo refresque.",
      );
    }

    // Delegar mantiene un solo camino de verdad: lock por orden, consumo
    // atómico vía RPC y reset de contadores.
    return this.verifyClientCode(userId, match.id, code);
  }

  /**
   * Verifica el código numérico que el cliente le dicta al repartidor. Para
   * frenar un bot que pruebe las 10 000 combinaciones durante la ventana
   * TTL, llevamos contador de intentos fallidos POR ORDEN y bloqueamos 15 min
   * tras 5 fallos. El throttler global ya recorta la ráfaga por IP; esto
   * cierra el vector del repartidor malicioso autenticado.
   */
  async verifyClientCode(userId: string, orderId: string, code: string) {
    const dom = await this.requireMyDomiciliario(userId);

    const { data: order } = await this.supabase.admin
      .from("orders")
      .select(
        "id, delivery_id, status, delivery_confirmation, qr_consumed_at, receiver_prefilled, user_id, verify_code_failed_attempts, verify_code_locked_until",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (!order) throw new NotFoundException("Orden no encontrada");
    if (order.delivery_id !== dom.id) {
      throw new ForbiddenException("Esta orden no está asignada a ti");
    }
    if (order.status !== "PAID" && order.status !== "SHIPPED") {
      throw new BadRequestException(
        `No se puede verificar código para una orden en estado ${order.status}`,
      );
    }
    if (order.delivery_confirmation === "DISPUTED") {
      throw new BadRequestException(
        "Esta orden tiene una disputa abierta pendiente de revisión",
      );
    }
    if (order.qr_consumed_at) {
      throw new BadRequestException("Esta orden ya fue aprobada por el cliente");
    }

    if (
      order.verify_code_locked_until &&
      new Date(order.verify_code_locked_until) > new Date()
    ) {
      throw new ForbiddenException(
        "Demasiados intentos fallidos. Intenta de nuevo en unos minutos o pide al cliente un nuevo código.",
      );
    }

    const hash = this.qr.hashClientCode(orderId, code);
    const { data: consumed, error } = await this.supabase.admin.rpc(
      "consume_order_client_code",
      { p_order_id: orderId, p_hash: hash },
    );
    if (error) throw error;

    if (!consumed) {
      const nextAttempts = (order.verify_code_failed_attempts ?? 0) + 1;
      const patch: Record<string, unknown> = {
        verify_code_failed_attempts: nextAttempts,
      };
      if (nextAttempts >= 5) {
        patch.verify_code_locked_until = new Date(
          Date.now() + 15 * 60_000,
        ).toISOString();
        patch.verify_code_failed_attempts = 0;
      }
      await this.supabase.admin
        .from("orders")
        .update(patch)
        .eq("id", orderId);

      throw new UnauthorizedException(
        "Código inválido o expirado. Pide al cliente que lo refresque.",
      );
    }

    // Éxito: reset de contadores
    if (
      (order.verify_code_failed_attempts ?? 0) > 0 ||
      order.verify_code_locked_until
    ) {
      await this.supabase.admin
        .from("orders")
        .update({
          verify_code_failed_attempts: 0,
          verify_code_locked_until: null,
        })
        .eq("id", orderId);
    }

    const prefilled = order.receiver_prefilled as
      | { nombreReceptor?: string; tipoDocumento?: string; numeroDocumento?: string }
      | null;
    const needsReceiver =
      !prefilled?.nombreReceptor ||
      !prefilled?.tipoDocumento ||
      !prefilled?.numeroDocumento;

    return {
      ok: true,
      orderId,
      needsReceiverData: needsReceiver,
      prefill: prefilled ?? null,
    };
  }

  // ───────────────────── Escaneo QR ─────────────────────
  async scanQr(userId: string, dto: ScanQrDto) {
    const dom = await this.requireMyDomiciliario(userId);
    const payload = this.qr.verify(dto.token);

    // La orden debe estar asignada a este domiciliario y en estado PAID o SHIPPED
    const { data: order } = await this.supabase.admin
      .from("orders")
      .select(
        "id, delivery_id, status, delivery_confirmation, qr_jti, qr_consumed_at, receiver_prefilled, user_id",
      )
      .eq("id", payload.orderId)
      .maybeSingle();
    if (!order) throw new NotFoundException("Orden no encontrada");
    if (order.delivery_id !== dom.id) {
      throw new ForbiddenException("Esta orden no está asignada a ti");
    }
    if (order.status !== "PAID" && order.status !== "SHIPPED") {
      throw new BadRequestException(
        `No se puede escanear QR para una orden en estado ${order.status}`,
      );
    }
    if (order.delivery_confirmation === "DISPUTED") {
      throw new BadRequestException(
        "Esta orden tiene una disputa abierta pendiente de revisión",
      );
    }
    if (order.qr_jti !== payload.jti) {
      throw new UnauthorizedException("QR obsoleto. Pide al cliente que lo refresque");
    }

    // Consumo atómico vía RPC (anti doble escaneo)
    const { data: consumed, error: cErr } = await this.supabase.admin.rpc(
      "consume_order_qr",
      { p_order_id: payload.orderId, p_jti: payload.jti },
    );
    if (cErr) throw cErr;
    if (!consumed) throw new UnauthorizedException("Este QR ya fue consumido");

    // Marcar el jti como usado también en Redis (defensa en profundidad)
    try {
      await this.qr.consumeJti(payload.jti);
    } catch {
      // Si falla el consume en Redis pero la DB ya lo marcó, seguimos.
    }

    // Datos de receptor: priorizar los del DTO; si no, los prerellenados.
    const prefilled = order.receiver_prefilled as
      | { nombreReceptor?: string; tipoDocumento?: string; numeroDocumento?: string }
      | null;
    const receiverName = dto.receiverName ?? prefilled?.nombreReceptor;
    const documentType = dto.documentType ?? prefilled?.tipoDocumento;
    const documentNumber = dto.documentNumber ?? prefilled?.numeroDocumento;

    const needsReceiver = !receiverName || !documentType || !documentNumber;

    return {
      ok: true,
      orderId: order.id,
      needsReceiverData: needsReceiver,
      prefill: prefilled ?? null,
      qrConsumed: true,
    };
  }

  // ───────────────────── Confirmar entrega (post-QR o código) ─────────────────────
  async confirmDelivery(
    userId: string,
    orderId: string,
    receiverName: string,
    documentType: "CC" | "CE" | "PP" | "NIT",
    documentNumber: string,
    source: "qr" | "manual" | "cliente",
  ) {
    const dom = await this.requireMyDomiciliario(userId);
    const { data: order } = await this.supabase.admin
      .from("orders")
      .select("id, delivery_id, status, delivery_confirmation, qr_consumed_at, shipped_at")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) throw new NotFoundException("Orden no encontrada");
    if (order.delivery_id !== dom.id) {
      throw new ForbiddenException("Orden no asignada a ti");
    }
    if (order.status === "DELIVERED") {
      throw new BadRequestException("La orden ya está entregada");
    }
    if (order.status !== "PAID" && order.status !== "SHIPPED") {
      throw new BadRequestException(
        `No se puede confirmar la entrega de una orden en estado ${order.status}`,
      );
    }
    if (order.delivery_confirmation === "DISPUTED") {
      throw new BadRequestException(
        "Esta orden tiene una disputa abierta pendiente de revisión",
      );
    }

    // Vacío B: Siempre exigir que el QR o el código de 4 dígitos haya sido
    // aprobado previamente (ambos setean qr_consumed_at). Si el cliente no
    // tiene QR ni código, el único camino permitido es simulateDelivery (con PIN
    // y ventana de 48 h de confirmación/disputa).
    if (!order.qr_consumed_at) {
      throw new BadRequestException(
        "El QR o código de 4 dígitos aún no ha sido aprobado por el cliente",
      );
    }

    // Insertar recibido
    const { error: rErr } = await this.supabase.admin.from("recibido").upsert({
      order_id: orderId,
      domiciliario_id: dom.id,
      nombre_receptor: receiverName,
      tipo_documento: documentType,
      numero_documento: documentNumber,
      qr_consumido: source === "qr",
      fuente: source,
    });
    if (rErr) throw rErr;

    // Marcar orden entregada. Si nunca pasó por el paso SHIPPED (el admin no
    // lo marcó manualmente) rellenamos shipped_at para que la timeline del
    // cliente no se salte ese check.
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status: "DELIVERED",
      delivered_at: now,
    };
    if (!order.shipped_at) patch.shipped_at = now;
    // Si el pedido venía de una simulación (PENDING_CLIENT), este QR/código es
    // la prueba de que el cliente sí recibió: se cierra la ventana y se apaga
    // el aviso de "confirma tu entrega". Sin esto el cliente seguiría viendo
    // el banner de una entrega que ya validó.
    if (order.delivery_confirmation === "PENDING_CLIENT") {
      patch.delivery_confirmation = "ACCEPTED";
      patch.delivery_auto_confirm_at = null;
      patch.delivery_reminder_at = null;
      patch.delivery_reminder_sent_at = null;
    }

    const { data: updated, error: uErr } = await this.supabase.admin
      .from("orders")
      .update(patch)
      .eq("id", orderId)
      .select()
      .single();
    if (uErr) throw uErr;

    await this.audit.record(userId, "ORDER_DELIVERED_BY_REPARTIDOR", orderId, {
      source,
      receiverName,
    });

    return updated;
  }

  /**
   * Simulación de entrega (receptor sin acceso a QR ni código).
   * NO marca DELIVERED. Marca `delivery_confirmation='PENDING_CLIENT'` y abre
   * la ventana de 48 h: recordatorio a las 24 h y, si el cliente no responde,
   * el pedido pasa a DISPUTED (nunca se auto-acepta). Sólo es válida si el QR
   * y el código del cliente siguen sin consumirse.
   */
  async simulateDelivery(userId: string, orderId: string, dto: SimulateDeliveryDto) {
    const dom = await this.requireMyDomiciliario(userId);

    const { data: order } = await this.supabase.admin
      .from("orders")
      .select(
        "id, delivery_id, status, user_id, delivery_confirmation, shipped_at, qr_consumed_at",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (!order) throw new NotFoundException("Orden no encontrada");
    if (order.delivery_id !== dom.id) {
      throw new ForbiddenException("Orden no asignada a ti");
    }
    if (order.status === "DELIVERED") {
      throw new BadRequestException("La orden ya está entregada");
    }
    if (order.status !== "PAID" && order.status !== "SHIPPED") {
      throw new BadRequestException(
        `Solo se puede simular la entrega de órdenes PAID o SHIPPED (estado actual: ${order.status})`,
      );
    }
    if (order.delivery_confirmation === "DISPUTED") {
      throw new BadRequestException(
        "Esta orden tiene una disputa abierta pendiente de revisión",
      );
    }
    if (order.delivery_confirmation === "PENDING_CLIENT") {
      throw new BadRequestException(
        "Ya marcaste esta entrega como simulada; está esperando confirmación del cliente",
      );
    }
    // La simulación existe sólo para cuando el cliente no pudo validar nada.
    // Si el QR o su código ya se consumieron, el pedido tiene prueba del
    // cliente: se marca entregado y se acabó. Sin este guard el repartidor
    // podía escanear el QR y después "simular" para saltarse la entrega.
    if (order.qr_consumed_at) {
      throw new BadRequestException(
        "El cliente ya validó el QR o su código. Marca la entrega como entregada; no hace falta simularla.",
      );
    }

    // El PIN identifica al repartidor, no al cliente: es una firma de quien
    // entrega. Si no lo tiene a mano puede omitirlo explícitamente; el
    // respaldo real contra el fraude es la aceptación del cliente en 48 h.
    if (!dto.skipPin) {
      if (!dto.pin) {
        throw new BadRequestException(
          "Indica tu PIN de 4 dígitos o marca que no lo tienes a mano",
        );
      }
      await this.requireValidPin(dom.id, dto.pin);
    }

    // Autorellenar desde el perfil si falta algún dato.
    let receiverName = dto.receiverName?.trim();
    let documentType = dto.documentType;
    let documentNumber = dto.documentNumber?.trim();

    if (!receiverName || !documentType || !documentNumber) {
      const { data: profile } = await this.supabase.admin
        .from("profiles")
        .select("full_name, document_type, document_number")
        .eq("id", order.user_id)
        .maybeSingle();
      receiverName = receiverName || profile?.full_name || "";
      documentType = (documentType ||
        profile?.document_type ||
        "CC") as typeof documentType;
      documentNumber = documentNumber || profile?.document_number || "";
    }
    if (!receiverName || !documentNumber) {
      throw new BadRequestException(
        "Faltan nombre o documento del receptor. Pide al cliente que complete su perfil o diligéncialo manualmente.",
      );
    }

    const hours = this.config.getOrThrow<number>("SIMULATED_DELIVERY_HOURS");
    const reminderHours = this.config.getOrThrow<number>(
      "SIMULATED_DELIVERY_REMINDER_HOURS",
    );
    const now = new Date();
    const autoConfirmAt = new Date(now.getTime() + hours * 60 * 60_000);
    // Hito intermedio: si el cliente no respondió al recordatorio, tampoco
    // responderá al vencimiento; se usa para avisarle antes de la disputa.
    const reminderAt = new Date(
      now.getTime() + Math.min(reminderHours, hours - 1) * 60 * 60_000,
    );

    // Insertar recibido (fuente simulated).
    const { error: rErr } = await this.supabase.admin.from("recibido").upsert({
      order_id: orderId,
      domiciliario_id: dom.id,
      nombre_receptor: receiverName,
      tipo_documento: documentType,
      numero_documento: documentNumber,
      qr_consumido: false,
      fuente: "simulated",
    });
    if (rErr) throw rErr;

    // Marcar la orden como pendiente de confirmación. Al simular también
    // la movemos a SHIPPED (si todavía no estaba) y rellenamos shipped_at
    // para que la timeline del cliente marque ese paso. El salto a
    // DELIVERED ocurre sólo cuando el cliente confirma o vence el plazo.
    const patch: Record<string, unknown> = {
      delivery_confirmation: "PENDING_CLIENT",
      delivery_simulated_at: now.toISOString(),
      delivery_auto_confirm_at: autoConfirmAt.toISOString(),
      delivery_reminder_at: reminderAt.toISOString(),
      delivery_reminder_sent_at: null,
      delivery_pin_skipped: Boolean(dto.skipPin),
    };
    if (order.status === "PAID") patch.status = "SHIPPED";
    if (!order.shipped_at) patch.shipped_at = now.toISOString();

    const { data: updated, error: uErr } = await this.supabase.admin
      .from("orders")
      .update(patch)
      .eq("id", orderId)
      .select()
      .single();
    if (uErr) throw uErr;

    await this.audit.record(userId, "ORDER_SIMULATED_BY_REPARTIDOR", orderId, {
      receiverName,
      documentType,
      pin_verified: !dto.skipPin,
      auto_confirm_at: autoConfirmAt.toISOString(),
      reminder_at: reminderAt.toISOString(),
    });

    // Push al cliente — best-effort. `requireInteraction` mantiene la
    // notificación en pantalla hasta que la cierre o la atienda: esta no es
    // una novedad, es una decisión que el pedido no puede esperar 48 h.
    this.push
      .sendToUser(order.user_id, {
        title: "Confirma tu entrega",
        body: `El repartidor marcó tu pedido #${orderId.slice(0, 8)} como entregado. Si no lo recibiste o no lo aceptas en ${hours} h, el caso pasa a disputa.`,
        url: `/cuenta/pedidos/${orderId}`,
        requireInteraction: true,
        tag: `delivery-confirm-${orderId}`,
      })
      .catch((e) =>
        this.logger.warn(`push simulate falló: ${(e as Error).message}`),
      );

    return updated;
  }

  // ───────────────────── Admin CRUD ─────────────────────
  async adminList() {
    // No hay FK directa domiciliarios -> profiles (user_id apunta a auth.users),
    // así que PostgREST no puede resolver el join automáticamente. Hacemos dos
    // queries y las empalmamos en memoria.
    const { data: rows, error } = await this.supabase.admin
      .from("domiciliarios")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    if (!rows || rows.length === 0) return [];

    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
    let profilesById = new Map<string, { email: string | null; full_name: string | null }>();
    if (userIds.length > 0) {
      const { data: profiles, error: pErr } = await this.supabase.admin
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);
      if (pErr) throw pErr;
      profilesById = new Map(
        (profiles ?? []).map((p) => [p.id, { email: p.email, full_name: p.full_name }]),
      );
    }

    return rows.map((r) => ({
      ...r,
      user: profilesById.get(r.user_id) ?? null,
    }));
  }

  async adminCreate(adminId: string, dto: CreateDomiciliarioDto) {
    let userId = dto.userId;
    if (!userId) {
      if (!dto.email || !dto.password) {
        throw new BadRequestException(
          "Debes proporcionar userId existente o email+password nuevos",
        );
      }
      const { data, error } = await this.supabase.admin.auth.admin.createUser({
        email: dto.email,
        password: dto.password,
        email_confirm: true,
        user_metadata: { full_name: dto.nombreCompleto },
      });
      if (error) throw new BadRequestException(error.message);
      if (!data.user) throw new BadRequestException("No se pudo crear el usuario");
      userId = data.user.id;
      // Esperamos a que el trigger haya creado profiles
      await new Promise((r) => setTimeout(r, 300));
    }

    // Promover rol a REPARTIDOR
    const { error: pErr } = await this.supabase.admin
      .from("profiles")
      .update({ role: "REPARTIDOR", full_name: dto.nombreCompleto })
      .eq("id", userId);
    if (pErr) throw pErr;

    // Crear fila en domiciliarios
    const { data: dom, error: dErr } = await this.supabase.admin
      .from("domiciliarios")
      .insert({
        user_id: userId,
        nombre_completo: dto.nombreCompleto,
        departamento: dto.departamento,
        ciudad: dto.ciudad,
        vehiculo: dto.vehiculo,
        placa: dto.placa,
        ciudad_placa: dto.ciudadPlaca,
        disponibilidad: dto.disponibilidad ?? "DISPONIBLE",
      })
      .select()
      .single();
    if (dErr) throw dErr;

    await this.audit.record(adminId, "DELIVERY_CREATED", dom.id, {
      user_id: userId,
      ciudad: dto.ciudad,
    });

    if ((dto.disponibilidad ?? "DISPONIBLE") === "DISPONIBLE") {
      this.retryUnassignedOrdersForDepartment(dto.departamento).catch((e) =>
        this.logger.warn(
          `retryUnassignedOrdersForDepartment falló: ${(e as Error).message}`,
        ),
      );
    }

    return dom;
  }

  async adminUpdate(adminId: string, id: string, dto: UpdateDomiciliarioDto) {
    const patch: Record<string, unknown> = {};
    if (dto.nombreCompleto !== undefined) patch.nombre_completo = dto.nombreCompleto;
    if (dto.departamento !== undefined) patch.departamento = dto.departamento;
    if (dto.ciudad !== undefined) patch.ciudad = dto.ciudad;
    if (dto.vehiculo !== undefined) patch.vehiculo = dto.vehiculo;
    if (dto.placa !== undefined) patch.placa = dto.placa;
    if (dto.ciudadPlaca !== undefined) patch.ciudad_placa = dto.ciudadPlaca;
    if (dto.disponibilidad !== undefined) patch.disponibilidad = dto.disponibilidad;

    const { data, error } = await this.supabase.admin
      .from("domiciliarios")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    await this.audit.record(adminId, "DELIVERY_UPDATED", id, patch);

    if (data.disponibilidad === "DISPONIBLE") {
      this.retryUnassignedOrdersForDepartment(data.departamento).catch((e) =>
        this.logger.warn(
          `retryUnassignedOrdersForDepartment falló: ${(e as Error).message}`,
        ),
      );
    }

    return data;
  }

  /**
   * Vacío D: Cuando un domiciliario se crea o pasa a DISPONIBLE, reintenta
   * asignar automáticamente las órdenes PAID/SHIPPED que habían quedado
   * UNASSIGNED en su departamento.
   */
  private async retryUnassignedOrdersForDepartment(departamento: string) {
    const { data: unassigned } = await this.supabase.admin
      .from("orders")
      .select("id")
      .in("status", ["PAID", "SHIPPED"])
      .eq("delivery_status", "UNASSIGNED")
      .ilike("shipping_department", departamento)
      .order("created_at", { ascending: true })
      .limit(25);

    if (!unassigned || unassigned.length === 0) return;

    for (const row of unassigned) {
      await this.supabase.admin.rpc("assign_delivery", { p_order_id: row.id });
    }
    this.logger.log(
      `Reintentada asignación para ${unassigned.length} orden(es) UNASSIGNED en ${departamento}`,
    );
  }

  async adminDelete(adminId: string, id: string) {
    // Desvincular órdenes activas (dejarlas unassigned) y borrar el domiciliario
    await this.supabase.admin
      .from("orders")
      .update({ delivery_id: null, delivery_status: "UNASSIGNED" })
      .eq("delivery_id", id)
      .in("status", ["PAID", "SHIPPED"]);

    const { error } = await this.supabase.admin
      .from("domiciliarios")
      .delete()
      .eq("id", id);
    if (error) throw error;
    await this.audit.record(adminId, "DELIVERY_DELETED", id, {});
    return { ok: true };
  }
}
