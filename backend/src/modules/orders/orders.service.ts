import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseService } from "../../supabase/supabase.service";
import { RedisService } from "../../redis/redis.service";
import { QrService } from "../qr/qr.service";
import { InventoryService } from "../inventory/inventory.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { PushService } from "../push/push.service";
import { InvoicingService } from "../invoicing/invoicing.service";
import { GuestTokenService } from "../guest/guest-token.service";
import type { CreateOrderDto } from "./dto/create-order.dto";
import type { CreateReturnDto, ShipOrderDto } from "./dto/dispute.dto";
import type { AuthenticatedUser } from "../../common/types/user";

export interface ReceiverPrefill {
  nombreReceptor: string;
  tipoDocumento: "CC" | "CE" | "PP" | "NIT";
  numeroDocumento: string;
}

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly redis: RedisService,
    private readonly qr: QrService,
    private readonly inventory: InventoryService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditLogsService,
    private readonly push: PushService,
    private readonly invoicing: InvoicingService,
    private readonly guestToken: GuestTokenService,
  ) {}

  /**
   * Confirmación de entrega por el cliente cuando el repartidor simuló
   * la entrega. Marca `delivery_confirmation='ACCEPTED'` y status=DELIVERED.
   */
  async confirmSimulatedDelivery(userId: string | null, orderId: string) {
    const { data: order } = await this.supabase.admin
      .from("orders")
      .select("id, user_id, status, delivery_confirmation, shipped_at")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) throw new NotFoundException("Orden no encontrada");
    // `userId = null` sólo llega desde una ruta guest ya validada por token.
    if (userId && order.user_id !== userId) {
      throw new ForbiddenException("No es tu orden");
    }
    if (order.delivery_confirmation !== "PENDING_CLIENT") {
      throw new BadRequestException(
        "Esta orden no está pendiente de confirmación",
      );
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      delivery_confirmation: "ACCEPTED",
      status: "DELIVERED",
      delivered_at: now,
    };
    if (!order.shipped_at) patch.shipped_at = now;

    const { data, error } = await this.supabase.admin
      .from("orders")
      .update(patch)
      .eq("id", orderId)
      .select()
      .single();
    if (error) throw error;

    await this.audit.record(userId, "ORDER_DELIVERY_ACCEPTED_BY_CLIENT", orderId, {});
    return data;
  }

  /**
   * El cliente reporta que la entrega simulada no corresponde. Mantiene el
   * status en SHIPPED y notifica al admin para revisión manual.
   */
  async disputeSimulatedDelivery(
    userId: string | null,
    orderId: string,
    reason?: string,
  ) {
    const { data: order } = await this.supabase.admin
      .from("orders")
      .select("id, user_id, delivery_confirmation, delivery_id")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) throw new NotFoundException("Orden no encontrada");
    if (userId && order.user_id !== userId) {
      throw new ForbiddenException("No es tu orden");
    }
    if (order.delivery_confirmation !== "PENDING_CLIENT") {
      throw new BadRequestException(
        "Esta orden no está pendiente de confirmación",
      );
    }

    const { data, error } = await this.supabase.admin
      .from("orders")
      .update({
        delivery_confirmation: "DISPUTED",
        delivery_disputed_at: new Date().toISOString(),
        delivery_dispute_reason: reason ?? null,
      })
      .eq("id", orderId)
      .select()
      .single();
    if (error) throw error;

    await this.audit.record(userId, "ORDER_DELIVERY_DISPUTED_BY_CLIENT", orderId, {
      reason: reason ?? null,
    });

    // Notificar al admin (email) y al repartidor asignado (push). Best-effort.
    this.notifications
      .enqueueOrderDisputed(orderId)
      .catch((e) =>
        this.logger.warn(`enqueueOrderDisputed falló: ${(e as Error).message}`),
      );

    if (order.delivery_id) {
      const { data: dom } = await this.supabase.admin
        .from("domiciliarios")
        .select("user_id")
        .eq("id", order.delivery_id)
        .maybeSingle();
      if (dom?.user_id) {
        this.push
          .sendToUser(dom.user_id, {
            title: "Disputa recibida",
            body: `El cliente del pedido #${orderId.slice(0, 8)} reportó que no recibió el envío. Un admin lo revisará.`,
            url: `/domiciliario/pedidos/${orderId}`,
          })
          .catch((e) =>
            this.logger.warn(`push dispute falló: ${(e as Error).message}`),
          );
      }
    }

    return data;
  }

  /**
   * Lista de disputas para el admin. `resolved=false` → pendientes de
   * decisión; `resolved=true` → ya resueltas (REFUNDED o FORCED_ACCEPTED).
   */
  async listDisputes(resolved = false) {
    const q = this.supabase.admin
      .from("orders")
      .select(
        "*, items:order_items(*), recibido:recibido(nombre_receptor, tipo_documento, numero_documento, fuente, fecha, hora)",
      )
      .eq("delivery_confirmation", "DISPUTED")
      .order("delivery_disputed_at", { ascending: false });

    const filtered = resolved
      ? q.not("delivery_dispute_resolution", "is", null)
      : q.is("delivery_dispute_resolution", null);

    const { data, error } = await filtered;
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) return [];

    // Empalmar titular y domiciliario (sin FK directa con profiles).
    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
    const delivIds = Array.from(new Set(rows.map((r) => r.delivery_id).filter(Boolean)));

    const [{ data: profiles }, { data: doms }] = await Promise.all([
      userIds.length
        ? this.supabase.admin
            .from("profiles")
            .select("id, email, full_name")
            .in("id", userIds)
        : Promise.resolve({ data: [] }),
      delivIds.length
        ? this.supabase.admin
            .from("domiciliarios")
            .select("id, nombre_completo, placa, vehiculo")
            .in("id", delivIds)
        : Promise.resolve({ data: [] }),
    ]);

    const byUser = new Map((profiles ?? []).map((p) => [p.id, p]));
    const byDom = new Map((doms ?? []).map((d) => [d.id, d]));

    return rows.map((r) => ({
      ...r,
      customer: byUser.get(r.user_id) ?? null,
      domiciliario: byDom.get(r.delivery_id) ?? null,
    }));
  }

  async resolveDispute(
    adminId: string,
    orderId: string,
    decision: "REFUND" | "ACCEPT_DELIVERY",
    note: string | undefined,
    refund: (orderId: string) => Promise<unknown>,
  ) {
    const { data: order } = await this.supabase.admin
      .from("orders")
      .select(
        "id, user_id, status, shipped_at, delivery_confirmation, delivery_dispute_resolution",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (!order) throw new NotFoundException("Orden no encontrada");
    if (order.delivery_confirmation !== "DISPUTED") {
      throw new BadRequestException("Esta orden no está en disputa");
    }
    if (order.delivery_dispute_resolution) {
      throw new BadRequestException("Esta disputa ya fue resuelta");
    }

    const now = new Date().toISOString();

    if (decision === "REFUND") {
      // El refund delegate (PaymentsService) hace Stripe refund + status=CANCELLED.
      await refund(orderId);
      const { data, error } = await this.supabase.admin
        .from("orders")
        .update({
          delivery_dispute_resolution: "REFUNDED",
          delivery_dispute_resolved_at: now,
          delivery_dispute_resolved_by: adminId,
          delivery_dispute_resolution_note: note ?? null,
        })
        .eq("id", orderId)
        .select()
        .single();
      if (error) throw error;
      await this.audit.record(adminId, "DISPUTE_RESOLVED_REFUND", orderId, {
        note: note ?? null,
      });
      return data;
    }

    // ACCEPT_DELIVERY: forzamos entrega. Si shipped_at es null también lo cerramos.
    const patch: Record<string, unknown> = {
      status: "DELIVERED",
      delivered_at: now,
      delivery_confirmation: "ACCEPTED",
      delivery_dispute_resolution: "FORCED_ACCEPTED",
      delivery_dispute_resolved_at: now,
      delivery_dispute_resolved_by: adminId,
      delivery_dispute_resolution_note: note ?? null,
    };
    if (!order.shipped_at) patch.shipped_at = now;

    const { data, error } = await this.supabase.admin
      .from("orders")
      .update(patch)
      .eq("id", orderId)
      .select()
      .single();
    if (error) throw error;
    await this.audit.record(adminId, "DISPUTE_RESOLVED_FORCED_ACCEPTED", orderId, {
      note: note ?? null,
    });
    return data;
  }

  /**
   * Crea la orden en estado PENDING_PAYMENT. El decremento de stock
   * se hace en el webhook de Stripe cuando el pago se confirma.
   */
  async create(
    userId: string | null,
    dto: CreateOrderDto,
    guest?: { email: string; fullName: string },
  ) {
    if (!userId && !guest) {
      throw new BadRequestException(
        "Para comprar sin cuenta necesitamos tu correo y nombre.",
      );
    }

    // 1. Resolver precios y nombres actuales de cada variante (snapshot)
    const variantIds = dto.items.map((i) => i.variantId);
    const { data: variants, error: vErr } = await this.supabase.admin
      .from("product_variants")
      .select(
        "id, size, color_name, stock, products(name, price_cop, currency, drop_starts_at, drop_ends_at)",
      )
      .in("id", variantIds);
    if (vErr) throw vErr;
    if (!variants || variants.length !== variantIds.length) {
      throw new NotFoundException("One or more variants not found");
    }

    // 1.5 Rechazar si cualquier producto está fuera de su ventana de drop
    const now = Date.now();
    for (const v of variants) {
      const prod = Array.isArray(v.products) ? v.products[0] : v.products;
      if (!prod) continue;
      const startsAt = prod.drop_starts_at ? Date.parse(prod.drop_starts_at) : null;
      const endsAt = prod.drop_ends_at ? Date.parse(prod.drop_ends_at) : null;
      if (startsAt !== null && now < startsAt) {
        throw new BadRequestException(
          `"${prod.name}" aún no está disponible — la venta inicia ${new Date(startsAt).toLocaleString("es-CO")}`,
        );
      }
      if (endsAt !== null && now > endsAt) {
        throw new BadRequestException(
          `"${prod.name}" ya no está a la venta — la ventana cerró ${new Date(endsAt).toLocaleString("es-CO")}`,
        );
      }
    }

    const varById = new Map(variants.map((v) => [v.id, v]));

    // 2. Resolver snapshot de precios y nombres (el chequeo de stock
    //    disponible es responsabilidad de reserve_variant_stock más abajo,
    //    que considera reservas activas de otras órdenes)
    let subtotalCop = 0;
    const itemsRows = dto.items.map((it) => {
      const v = varById.get(it.variantId)!;
      const prod = Array.isArray(v.products) ? v.products[0] : v.products;
      if (!prod) throw new NotFoundException(`Product missing for variant ${it.variantId}`);
      const unit = prod.price_cop as number;
      subtotalCop += unit * it.quantity;
      return {
        product_variant_id: v.id,
        product_name_snapshot: prod.name as string,
        variant_label: `${v.size} · ${v.color_name}`,
        unit_price_cop: unit,
        quantity: it.quantity,
      };
    });

    // 2.5 (G4) Validar y redimir cupón promocional si fue enviado
    let discountCop = 0;
    let appliedCouponCode: string | null = null;
    if (dto.couponCode && dto.couponCode.trim()) {
      const couponResult = await this.redeemCoupon(dto.couponCode.trim(), subtotalCop);
      discountCop = couponResult.discountCop;
      appliedCouponCode = couponResult.code;
    }

    const netItemsCop = Math.max(0, subtotalCop - discountCop);

    // 3. Calcular costo de envío según departamento y subtotal neto
    const shippingCost = await this.getShippingCost(
      dto.shippingAddress.department,
      netItemsCop,
    );
    const total = netItemsCop + shippingCost;

    // (G6) IVA 19% incluido. El envío cobrado por ARShop también hace parte
    // de la base gravable; se discrimina para la factura electrónica.
    const itemTaxCop = netItemsCop - Math.round(netItemsCop / 1.19);
    const shippingTaxCop =
      shippingCost > 0 ? shippingCost - Math.round(shippingCost / 1.19) : 0;
    const taxCop = itemTaxCop + shippingTaxCop;
    const taxableBaseCop = total - taxCop;

    // Snapshot fiscal del comprador (si el checkout lo envía). Si no, se
    // completa desde el perfil y la factura usa consumidor final como respaldo.
    let billing = dto.billing;
    if (!billing && userId) {
      // El snapshot fiscal nunca debe bloquear el checkout: si el perfil no
      // está disponible se factura como consumidor final.
      try {
        const { data: profile } = await this.supabase.admin
          .from("profiles")
          .select("email, full_name, document_type, document_number")
          .eq("id", userId)
          .maybeSingle();
        if (profile?.document_number) {
          billing = {
            documentType: (profile.document_type ?? "CC") as "CC" | "CE" | "PP" | "NIT",
            documentNumber: profile.document_number,
            legalName: profile.full_name ?? profile.email ?? "Consumidor final",
            email: profile.email ?? undefined,
          };
        }
      } catch (err) {
        this.logger.warn(
          `No se pudo leer el perfil fiscal de ${userId}: ${(err as Error).message}`,
        );
      }
    }

    // 4. Crear order + items
    const baseOrderPayload = {
      user_id: userId,
      is_guest: !userId,
      guest_email: guest?.email?.trim().toLowerCase() ?? null,
      guest_name: guest?.fullName?.trim() ?? null,
      total_cop: total,
      shipping_cost_cop: shippingCost,
      currency: "COP",
      status: "PENDING_PAYMENT" satisfies OrderStatus,
      shipping_address: dto.shippingAddress,
      shipping_city: dto.shippingAddress.city,
      shipping_department: dto.shippingAddress.department,
      shipping_phone: dto.shippingAddress.phone,
      notes: dto.shippingAddress.notes ?? null,
      habeas_data_accepted: true,
    };

    const extendedOrderPayload = {
      ...baseOrderPayload,
      subtotal_cop: subtotalCop,
      discount_cop: discountCop,
      coupon_code: appliedCouponCode,
      tax_cop: taxCop,
      taxable_base_cop: taxableBaseCop,
      shipping_tax_cop: shippingTaxCop,
      billing_document_type: billing?.documentType ?? null,
      billing_document_number: billing?.documentNumber ?? null,
      billing_legal_name: billing?.legalName ?? null,
      billing_email: billing?.email ?? null,
      billing_address: dto.shippingAddress,
      billing_municipality_code: null,
    };

    let { data: order, error: oErr } = await this.supabase.admin
      .from("orders")
      .insert(extendedOrderPayload)
      .select()
      .single();

    if (oErr && (oErr as { code?: string }).code === "42703") {
      // Fallback si la migración 024 aún no fue aplicada en la BD
      const fallback = await this.supabase.admin
        .from("orders")
        .insert(baseOrderPayload)
        .select()
        .single();
      order = fallback.data;
      oErr = fallback.error;
    }
    if (oErr) throw oErr;

    const { error: iErr } = await this.supabase.admin.from("order_items").insert(
      itemsRows.map((r) => ({ ...r, order_id: order.id })),
    );
    if (iErr) throw iErr;

    // 4.5 Reservar stock con TTL 15 min. Si otro checkout llegó primero
    //     por el mismo stock escaso, aquí falla y revertimos la orden.
    try {
      await this.inventory.reserveStock(
        order.id,
        dto.items.map((it) => ({
          variantId: it.variantId,
          quantity: it.quantity,
        })),
        15,
      );
    } catch (resErr) {
      await this.supabase.admin.from("orders").delete().eq("id", order.id);
      throw resErr;
    }

    // 5. Guardar automáticamente la dirección de entrega en Redis para futuras compras
    if (userId) {
      try {
        await this.redis.setJson(`user:${userId}:shipping_address`, dto.shippingAddress);
      } catch (rErr) {
        this.logger.warn(`Failed to cache shipping address in Redis: ${(rErr as Error).message}`);
      }
    }

    // Nota (Vacío C): la asignación de domiciliario (assign_delivery) ya NO
    // se ejecuta en PENDING_PAYMENT sino al confirmarse el pago (transición a
    // PAID en updateStatus), evitando asignar repartidores a checkouts
    // abandonados o impagos.

    this.logger.log(
      `Order ${order.id} created for ${userId ?? `guest:${order.guest_email}`} (${total} COP)`,
    );
    // El invitado recibe un token firmado para ver su pedido sin cuenta.
    // No se persiste: la firma HMAC lo hace verificable sin estado.
    return userId
      ? order
      : { ...order, guest_token: this.guestToken.issue(order.id) };
  }

  /**
   * Ejecuta la RPC `assign_delivery` para una orden ya pagada y notifica a los
   * administradores si queda en estado UNASSIGNED.
   */
  async assignDeliveryForOrder(orderId: string) {
    try {
      const { data: assignment, error: aErr } = await this.supabase.admin.rpc(
        "assign_delivery",
        { p_order_id: orderId },
      );
      if (aErr) {
        this.logger.warn(`assign_delivery falló para ${orderId}: ${aErr.message}`);
        return null;
      }
      this.logger.log(
        `Order ${orderId} delivery assignment: ${JSON.stringify(assignment)}`,
      );
      if ((assignment as { status?: string } | null)?.status === "UNASSIGNED") {
        await this.notifications
          .enqueueOrderUnassigned(orderId)
          .catch((e) =>
            this.logger.warn(`enqueue order-unassigned falló: ${(e as Error).message}`),
          );
      }
      return assignment;
    } catch (e) {
      this.logger.warn(`assign_delivery error: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Reintenta o fuerza la asignación de repartidor para una orden PAID o SHIPPED.
   * Uso administrativo para rescatar órdenes UNASSIGNED o cambiar de repartidor.
   */
  async reassignDelivery(
    adminId: string,
    orderId: string,
    domiciliarioId?: string,
  ) {
    const { data: order } = await this.supabase.admin
      .from("orders")
      .select(
        "id, status, shipping_department, shipping_city, delivery_id, delivery_status",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (!order) throw new NotFoundException("Orden no encontrada");
    if (!["PAID", "SHIPPED"].includes(order.status)) {
      throw new BadRequestException(
        `Solo se puede asignar repartidor a órdenes PAID o SHIPPED (estado actual: ${order.status})`,
      );
    }

    if (domiciliarioId) {
      const { data: dom } = await this.supabase.admin
        .from("domiciliarios")
        .select("id, departamento, ciudad, disponibilidad")
        .eq("id", domiciliarioId)
        .maybeSingle();
      if (!dom) throw new NotFoundException("Domiciliario no encontrado");

      const exactCity =
        dom.departamento.toLowerCase() === order.shipping_department.toLowerCase() &&
        dom.ciudad.toLowerCase() === order.shipping_city.toLowerCase();

      const deliveryStatus = exactCity ? "ASSIGNED" : "REASSIGNED_DEPT";
      const deliveryWarning = exactCity
        ? null
        : "La entrega puede llegar con 2-3 días de retraso";

      const { error: uErr } = await this.supabase.admin
        .from("orders")
        .update({
          delivery_id: dom.id,
          delivery_status: deliveryStatus,
          delivery_warning: deliveryWarning,
          delivery_city: order.shipping_city,
          delivery_km_extra: exactCity ? null : 20,
        })
        .eq("id", orderId);
      if (uErr) throw uErr;

      await this.audit.record(adminId, "ORDER_DELIVERY_REASSIGNED", orderId, {
        mode: "manual",
        domiciliarioId: dom.id,
        deliveryStatus,
      });
    } else {
      const assignment = await this.assignDeliveryForOrder(orderId);
      await this.audit.record(adminId, "ORDER_DELIVERY_REASSIGNED", orderId, {
        mode: "auto",
        assignment,
      });
    }

    return this.findByIdWithItems(orderId);
  }

  /**
   * Genera (o refresca) el QR firmado para una orden del cliente.
   * El JWT-lite se emite siempre nuevo para que un QR filtrado pierda
   * validez rápido. El `jti` se persiste en orders.qr_jti.
   *
   * El código de 4 dígitos NO rota con el QR mientras siga vigente y el
   * cliente pida conservarlo (`keepCode`): la página refresca el QR cada 60 s
   * y, si cada refresco reescribiera el hash, el código que el cliente acaba
   * de dictar quedaba inválido en la puerta. Sólo se emite uno nuevo cuando
   * expiró (o en la primera carga de la página, que es cuando hace falta el
   * valor en claro).
   */
  async issueQr(userId: string | null, orderId: string, keepCodeExp?: string) {
    const { data: order } = await this.supabase.admin
      .from("orders")
      .select("id, user_id, status, qr_consumed_at, qr_jti, client_code_hash, client_code_exp, estimated_delivery_at, delivery_warning, delivery_status, delivery_id, receiver_prefilled")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) throw new NotFoundException("Orden no encontrada");
    if (userId && order.user_id !== userId) {
      throw new ForbiddenException("No es tu orden");
    }
    if (!["PAID", "SHIPPED", "DELIVERED"].includes(order.status)) {
      throw new BadRequestException(
        "El código QR solo está disponible para pedidos pagados",
      );
    }

    if (order.qr_consumed_at) {
      // Entregado: no emitimos nuevo QR; devolvemos info para pintar el overlay verde.
      return {
        consumed: true,
        consumedAt: order.qr_consumed_at,
        estimatedDeliveryAt: order.estimated_delivery_at,
        deliveryWarning: order.delivery_warning,
        receiverPrefilled: order.receiver_prefilled ?? null,
      };
    }

    const storedExpSec = order.client_code_exp
      ? Math.floor(new Date(order.client_code_exp).getTime() / 1000)
      : 0;
    const codeStillValid =
      Boolean(order.client_code_hash) && storedExpSec * 1000 > Date.now();
    const keepRequested =
      Boolean(keepCodeExp) && Number(keepCodeExp) === storedExpSec;
    const reuseClientCode = codeStillValid && keepRequested;

    const { token, jti, exp } = this.qr.issue(orderId);
    const clientCode = reuseClientCode
      ? null
      : this.qr.issueClientCode(orderId);

    const patch: Record<string, unknown> = { qr_jti: jti };
    if (clientCode) {
      patch.client_code_hash = clientCode.hash;
      patch.client_code_exp = new Date(clientCode.exp * 1000).toISOString();
    }
    const { error } = await this.supabase.admin
      .from("orders")
      .update(patch)
      .eq("id", orderId);
    if (error) throw error;

    const dataUrl = await this.qr.toDataUrl(token);
    return {
      consumed: false,
      token,
      dataUrl,
      exp,
      clientCode: clientCode?.code,
      clientCodeExp: clientCode ? clientCode.exp : storedExpSec,
      estimatedDeliveryAt: order.estimated_delivery_at,
      deliveryWarning: order.delivery_warning,
      receiverPrefilled: order.receiver_prefilled ?? null,
      deliveryStatus: order.delivery_status,
    };
  }

  async saveReceiverPrefill(
    userId: string | null,
    orderId: string,
    data: ReceiverPrefill,
  ) {
    const { data: order } = await this.supabase.admin
      .from("orders")
      .select("id, user_id")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) throw new NotFoundException("Orden no encontrada");
    if (userId && order.user_id !== userId) {
      throw new ForbiddenException("No es tu orden");
    }

    const { error } = await this.supabase.admin
      .from("orders")
      .update({ receiver_prefilled: data })
      .eq("id", orderId);
    if (error) throw error;
    return { ok: true };
  }

  /** Devuelve una orden con items. Uso admin / webhook — no filtra por usuario. */
  async findByIdWithItems(orderId: string) {
    const { data, error } = await this.supabase.admin
      .from("orders")
      .select("*, items:order_items(*)")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findByIdForUser(orderId: string, userId: string) {
    const { data, error } = await this.supabase.admin
      .from("orders")
      .select("*, items:order_items(*)")
      .eq("id", orderId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Order not found");

    return this.withOrderExtras(data);
  }

  /**
   * Detalle de un pedido de invitado a partir del token firmado.
   * El token es la credencial: no se consulta la sesión. Sólo aplica a
   * órdenes creadas como guest (`is_guest = true`), incluso después de que
   * el comprador las reclame a su cuenta.
   */
  async findGuestOrder(token: string) {
    const { orderId } = this.guestToken.verify(token);
    const { data, error } = await this.supabase.admin
      .from("orders")
      .select("*, items:order_items(*)")
      .eq("id", orderId)
      .eq("is_guest", true)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Pedido no encontrado");

    return this.withOrderExtras(data);
  }

  /** Verifica el token y que la orden siga siendo de invitado. */
  private async resolveGuestOrderId(token: string): Promise<string> {
    const { orderId } = this.guestToken.verify(token);
    const { data, error } = await this.supabase.admin
      .from("orders")
      .select("id")
      .eq("id", orderId)
      .eq("is_guest", true)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Pedido no encontrado");
    return orderId;
  }

  /** QR de un pedido guest, autenticado por el token del enlace. */
  async issueQrForGuest(token: string, keepCodeExp?: string) {
    const orderId = await this.resolveGuestOrderId(token);
    return this.issueQr(null, orderId, keepCodeExp);
  }

  async confirmSimulatedDeliveryForGuest(token: string) {
    const orderId = await this.resolveGuestOrderId(token);
    return this.confirmSimulatedDelivery(null, orderId);
  }

  async disputeSimulatedDeliveryForGuest(token: string, reason?: string) {
    const orderId = await this.resolveGuestOrderId(token);
    return this.disputeSimulatedDelivery(null, orderId, reason);
  }

  async saveReceiverPrefillForGuest(token: string, data: ReceiverPrefill) {
    const orderId = await this.resolveGuestOrderId(token);
    return this.saveReceiverPrefill(null, orderId, data);
  }

  /**
   * Vincula un pedido de invitado a la cuenta autenticada. Exige que el
   * correo de la cuenta coincida con `guest_email`: el token identifica el
   * pedido, el correo confirma la identidad.
   */
  async claimGuestOrder(user: AuthenticatedUser, token: string) {
    const { orderId } = this.guestToken.verify(token);
    const { data: order, error } = await this.supabase.admin
      .from("orders")
      .select("id, user_id, guest_email, is_guest")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order) throw new NotFoundException("Pedido no encontrado");
    if (!order.is_guest) {
      throw new BadRequestException("Este pedido ya pertenece a una cuenta.");
    }
    if (order.user_id === user.id) {
      return { ok: true, alreadyClaimed: true };
    }
    if (order.user_id) {
      throw new ConflictException("Este pedido ya fue reclamado por otra cuenta.");
    }

    const accountEmail = user.email?.trim().toLowerCase() ?? "";
    const guestEmail = (order.guest_email ?? "").trim().toLowerCase();
    if (!accountEmail || accountEmail !== guestEmail) {
      throw new ForbiddenException(
        "Inicia sesión con el mismo correo que usaste al comprar.",
      );
    }

    const { data: updated, error: upErr } = await this.supabase.admin
      .from("orders")
      .update({ user_id: user.id })
      .eq("id", orderId)
      .is("user_id", null)
      .select("id")
      .maybeSingle();
    if (upErr) throw upErr;
    if (!updated) {
      throw new ConflictException(
        "Este pedido ya fue reclamado por otra cuenta.",
      );
    }

    await this.audit.record(user.id, "ORDER_GUEST_CLAIMED", orderId, {
      guestEmail,
    });

    return { ok: true, alreadyClaimed: false };
  }

  /** Adjunta devolución y factura sin bloquear el detalle si no existen. */
  private async withOrderExtras<T extends { id: string }>(order: T) {
    // Adjuntar solicitud de devolución/cambio (Ley 1480) si existe
    let returnRequest = null;
    try {
      const { data: ret } = await this.supabase.admin
        .from("order_returns")
        .select("*")
        .eq("order_id", order.id)
        .maybeSingle();
      returnRequest = ret ?? null;
    } catch {
      returnRequest = null;
    }

    // Adjuntar factura electrónica si ya fue emitida (nunca bloquea el detalle)
    const invoice = await this.invoicing.findForOrder(order.id);

    return {
      ...order,
      return_request: returnRequest,
      invoice,
    };
  }

  async listForUser(userId: string, limit = 20) {
    const { data, error } = await this.supabase.admin
      .from("orders")
      .select("id, status, total_cop, currency, created_at, paid_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  async listAll(limit = 50, cursor?: string) {
    let q = this.supabase.admin
      .from("orders")
      .select("*, items:order_items(*)")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (cursor) q = q.lt("created_at", cursor);
    const { data, error } = await q;
    if (error) throw error;

    const rows = data ?? [];
    const invoices = await this.invoicing.findForOrders(rows.map((row) => row.id));
    return rows.map((row) => ({
      ...row,
      invoice: invoices.get(row.id) ?? null,
    }));
  }

  async updateStatus(orderId: string, status: OrderStatus) {
    const patch: Record<string, unknown> = { status };
    if (status === "PAID") patch.paid_at = new Date().toISOString();
    if (status === "SHIPPED") patch.shipped_at = new Date().toISOString();
    if (status === "DELIVERED") patch.delivered_at = new Date().toISOString();
    if (status === "CANCELLED") {
      patch.delivery_id = null;
    }

    const { data, error } = await this.supabase.admin
      .from("orders")
      .update(patch)
      .eq("id", orderId)
      .select()
      .single();
    if (error) throw error;

    // Al confirmarse el pago (PAID) o al enviarse (SHIPPED) si aún no tenía
    // repartidor asignado, ejecutamos assign_delivery automáticamente.
    if (
      (status === "PAID" || status === "SHIPPED") &&
      (!data.delivery_status || data.delivery_status === "UNASSIGNED")
    ) {
      await this.assignDeliveryForOrder(orderId);
      const { data: refreshed } = await this.supabase.admin
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();
      if (refreshed) return refreshed;
    }

    return data;
  }

  private async getShippingCost(department: string, subtotal: number): Promise<number> {
    const { data } = await this.supabase.admin
      .from("shipping_rates")
      .select("cost_cop, free_above_cop")
      .eq("department", department)
      .maybeSingle();

    const costCop = data?.cost_cop ?? 22000;
    const freeAbove = data?.free_above_cop ?? 600000;
    return subtotal >= freeAbove ? 0 : costCop;
  }

  async attachStripeIntent(orderId: string, intentId: string) {
    const { error } = await this.supabase.admin
      .from("orders")
      .update({ stripe_payment_intent_id: intentId })
      .eq("id", orderId);
    if (error) throw error;
  }

  async setChargeCurrency(orderId: string, currency: string) {
    const { error } = await this.supabase.admin
      .from("orders")
      .update({ charge_currency: currency })
      .eq("id", orderId);
    if (error) throw error;
  }

  async findByStripeIntent(intentId: string) {
    const { data, error } = await this.supabase.admin
      .from("orders")
      .select("*, items:order_items(*)")
      .eq("stripe_payment_intent_id", intentId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /**
   * (G3) Marca la orden como SHIPPED, registrando opcionalmente transportadora
   * nacional, número de guía y enlace de rastreo.
   */
  async markShipped(orderId: string, dto?: ShipOrderDto) {
    const now = new Date().toISOString();
    const basePatch: Record<string, unknown> = {
      status: "SHIPPED" satisfies OrderStatus,
      shipped_at: now,
    };

    const hasCarrier = Boolean(
      dto?.carrier?.trim() || dto?.trackingNumber?.trim() || dto?.trackingUrl?.trim(),
    );
    const extendedPatch: Record<string, unknown> = {
      ...basePatch,
      ...(dto?.carrier !== undefined ? { shipping_carrier: dto.carrier.trim() || null } : {}),
      ...(dto?.trackingNumber !== undefined
        ? { tracking_number: dto.trackingNumber.trim() || null }
        : {}),
      ...(dto?.trackingUrl !== undefined
        ? { tracking_url: dto.trackingUrl.trim() || null }
        : {}),
    };

    let { data, error } = await this.supabase.admin
      .from("orders")
      .update(extendedPatch)
      .eq("id", orderId)
      .select()
      .single();

    if (error && (error as { code?: string }).code === "42703") {
      const fallback = await this.supabase.admin
        .from("orders")
        .update(basePatch)
        .eq("id", orderId)
        .select()
        .single();
      data = fallback.data;
      error = fallback.error;
    }
    if (error) throw error;

    // Si no se despachó por transportadora externa y aún no tenía domiciliario,
    // intentamos asignar repartidor local automáticamente.
    if (
      !hasCarrier &&
      (!data.delivery_status || data.delivery_status === "UNASSIGNED")
    ) {
      await this.assignDeliveryForOrder(orderId);
      const { data: refreshed } = await this.supabase.admin
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();
      if (refreshed) return refreshed;
    }

    return data;
  }

  /**
   * (G4) Valida un cupón promocional contra un subtotal en COP sin consumirlo.
   */
  async validateCoupon(rawCode: string, subtotalCop: number) {
    const cleanCode = rawCode.trim().toUpperCase();
    if (!cleanCode) {
      throw new BadRequestException("Debes ingresar un código de cupón");
    }

    // Semilla de respaldo por si la tabla public.coupons (migración 024) aún no existe
    const fallbackCoupons: Record<
      string,
      {
        code: string;
        discount_type: "PERCENT" | "FIXED_COP";
        discount_value: number;
        min_subtotal_cop: number;
        max_uses: number | null;
        uses_count: number;
        expires_at: string | null;
        active: boolean;
      }
    > = {
      BIENVENIDO10: {
        code: "BIENVENIDO10",
        discount_type: "PERCENT",
        discount_value: 10,
        min_subtotal_cop: 100000,
        max_uses: null,
        uses_count: 0,
        expires_at: null,
        active: true,
      },
      DROP15: {
        code: "DROP15",
        discount_type: "PERCENT",
        discount_value: 15,
        min_subtotal_cop: 250000,
        max_uses: 200,
        uses_count: 0,
        expires_at: null,
        active: true,
      },
      ARSHOP30K: {
        code: "ARSHOP30K",
        discount_type: "FIXED_COP",
        discount_value: 30000,
        min_subtotal_cop: 200000,
        max_uses: 100,
        uses_count: 0,
        expires_at: null,
        active: true,
      },
    };

    const { data: row, error } = await this.supabase.admin
      .from("coupons")
      .select("*")
      .ilike("code", cleanCode)
      .maybeSingle();

    const coupon =
      error && (error as { code?: string }).code === "42P01"
        ? fallbackCoupons[cleanCode] ?? null
        : row;

    if (error && (error as { code?: string }).code !== "42P01") {
      throw error;
    }

    if (!coupon || !coupon.active) {
      throw new BadRequestException("El cupón ingresado no existe o no está activo");
    }

    if (coupon.expires_at && Date.parse(coupon.expires_at) < Date.now()) {
      throw new BadRequestException("Este cupón ha expirado");
    }

    if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses) {
      throw new BadRequestException("Este cupón alcanzó su límite máximo de usos");
    }

    if (subtotalCop < (coupon.min_subtotal_cop ?? 0)) {
      throw new BadRequestException(
        `El cupón ${coupon.code} requiere una compra mínima de $${Number(coupon.min_subtotal_cop).toLocaleString("es-CO")} COP`,
      );
    }

    const discountCop =
      coupon.discount_type === "PERCENT"
        ? Math.round((subtotalCop * Number(coupon.discount_value)) / 100)
        : Math.min(subtotalCop, Number(coupon.discount_value));

    return {
      code: String(coupon.code).toUpperCase(),
      discountType: coupon.discount_type as "PERCENT" | "FIXED_COP",
      discountValue: Number(coupon.discount_value),
      minSubtotalCop: Number(coupon.min_subtotal_cop ?? 0),
      discountCop,
    };
  }

  /**
   * (G4) Valida y consume (incrementa uses_count) un cupón en el checkout.
   */
  async redeemCoupon(rawCode: string, subtotalCop: number) {
    const validated = await this.validateCoupon(rawCode, subtotalCop);
    try {
      const { data: rpcData, error: rpcErr } = await this.supabase.admin.rpc(
        "redeem_coupon",
        {
          p_code: validated.code,
          p_subtotal_cop: subtotalCop,
        },
      );
      if (!rpcErr && rpcData && typeof (rpcData as { discount_cop?: number }).discount_cop === "number") {
        return {
          code: (rpcData as { code: string }).code,
          discountCop: (rpcData as { discount_cop: number }).discount_cop,
        };
      }
    } catch {
      // Si la RPC aún no está instalada, continuamos con el cálculo ya validado
    }
    return {
      code: validated.code,
      discountCop: validated.discountCop,
    };
  }

  /**
   * (G2) Cancelación voluntaria pre-envío por parte del cliente o del admin.
   * - Si está en PENDING_PAYMENT: libera la reserva de stock y marca CANCELLED.
   * - Si está en PAID (aún no SHIPPED): ejecuta reembolso en Stripe + restaura
   *   stock real + marca CANCELLED.
   */
  async cancelOrder(
    actorId: string,
    isAdmin: boolean,
    orderId: string,
    refund: (orderId: string) => Promise<unknown>,
  ) {
    const { data: order } = await this.supabase.admin
      .from("orders")
      .select("id, user_id, status")
      .eq("id", orderId)
      .maybeSingle();

    if (!order) throw new NotFoundException("Orden no encontrada");
    if (!isAdmin && order.user_id !== actorId) {
      throw new ForbiddenException("No es tu orden");
    }

    if (order.status === "PENDING_PAYMENT") {
      await this.inventory.releaseReservation(orderId).catch((e) =>
        this.logger.warn(`releaseReservation en cancelOrder falló: ${(e as Error).message}`),
      );
      const updated = await this.updateStatus(orderId, "CANCELLED");
      await this.audit.record(actorId, "ORDER_CANCELLED", orderId, {
        by: isAdmin ? "ADMIN" : "CLIENT",
        previousStatus: "PENDING_PAYMENT",
      });
      return updated;
    }

    if (order.status === "PAID") {
      const refundedOrder = await refund(orderId);
      await this.audit.record(actorId, "ORDER_CANCELLED_REFUNDED", orderId, {
        by: isAdmin ? "ADMIN" : "CLIENT",
        previousStatus: "PAID",
      });
      return refundedOrder;
    }

    throw new BadRequestException(
      "Solo se pueden cancelar pedidos pendientes de pago o pagados que aún no han sido enviados",
    );
  }

  /**
   * Cuenta días hábiles (lunes a viernes) transcurridos entre dos fechas.
   */
  countBusinessDaysBetween(start: Date, end: Date): number {
    if (end <= start) return 0;
    let count = 0;
    const cursor = new Date(start.getTime());
    cursor.setHours(0, 0, 0, 0);
    const endDay = new Date(end.getTime());
    endDay.setHours(0, 0, 0, 0);

    while (cursor < endDay) {
      cursor.setDate(cursor.getDate() + 1);
      const dow = cursor.getDay();
      if (dow !== 0 && dow !== 6) {
        count++;
      }
    }
    return count;
  }

  /**
   * (G1) Solicitud de devolución, cambio de talla o retracto (Ley 1480 Art. 47).
   * - RETRACT_REFUND y SIZE_EXCHANGE: máximo 5 días hábiles desde delivered_at.
   * - DEFECTIVE (garantía legal): máximo 30 días calendario desde delivered_at.
   */
  async requestReturn(userId: string, orderId: string, dto: CreateReturnDto) {
    const { data: order } = await this.supabase.admin
      .from("orders")
      .select("id, user_id, status, delivered_at, updated_at")
      .eq("id", orderId)
      .maybeSingle();

    if (!order) throw new NotFoundException("Orden no encontrada");
    if (order.user_id !== userId) throw new ForbiddenException("No es tu orden");
    if (order.status !== "DELIVERED") {
      throw new BadRequestException(
        "Solo puedes solicitar cambios o devoluciones sobre pedidos entregados",
      );
    }

    if (dto.type === "SIZE_EXCHANGE" && !dto.requestedSize?.trim()) {
      throw new BadRequestException(
        "Debes especificar la talla deseada para solicitar un cambio de talla",
      );
    }

    const deliveredAt = new Date(
      order.delivered_at ?? order.updated_at ?? Date.now(),
    );
    const now = new Date();

    if (dto.type === "RETRACT_REFUND" || dto.type === "SIZE_EXCHANGE") {
      const businessDays = this.countBusinessDaysBetween(deliveredAt, now);
      if (businessDays > 5) {
        throw new BadRequestException(
          "El plazo legal de 5 días hábiles para retracto o cambio de talla (Ley 1480 Art. 47) ha vencido",
        );
      }
    } else if (dto.type === "DEFECTIVE") {
      const calendarDays = Math.floor(
        (now.getTime() - deliveredAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (calendarDays > 30) {
        throw new BadRequestException(
          "El plazo de 30 días calendario para reclamación por defecto de calidad ha vencido",
        );
      }
    }

    const { data: existing } = await this.supabase.admin
      .from("order_returns")
      .select("id, status")
      .eq("order_id", orderId)
      .maybeSingle();

    if (existing) {
      throw new BadRequestException(
        "Ya existe una solicitud de devolución o cambio registrada para este pedido",
      );
    }

    const { data: created, error } = await this.supabase.admin
      .from("order_returns")
      .insert({
        order_id: orderId,
        user_id: userId,
        type: dto.type,
        status: "REQUESTED",
        reason: dto.reason.trim(),
        requested_size: dto.requestedSize?.trim() || null,
      })
      .select()
      .single();

    if (error) throw error;

    await this.audit.record(userId, "ORDER_RETURN_REQUESTED", orderId, {
      returnId: created.id,
      type: dto.type,
      requestedSize: dto.requestedSize ?? null,
    });

    return created;
  }

  /**
   * (G1) Lista las solicitudes de devolución/cambio (RMA) para el panel admin.
   */
  async listReturns(resolved = false) {
    const q = this.supabase.admin
      .from("order_returns")
      .select("*")
      .order("created_at", { ascending: false });

    const filtered = resolved
      ? q.neq("status", "REQUESTED")
      : q.eq("status", "REQUESTED");

    const { data: rows, error } = await filtered;
    if (error) {
      if ((error as { code?: string }).code === "42P01") return [];
      throw error;
    }
    if (!rows || rows.length === 0) return [];

    const orderIds = Array.from(new Set(rows.map((r) => r.order_id).filter(Boolean)));
    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));

    const [{ data: orders }, { data: profiles }] = await Promise.all([
      orderIds.length
        ? this.supabase.admin
            .from("orders")
            .select("*, items:order_items(*)")
            .in("id", orderIds)
        : Promise.resolve({ data: [] }),
      userIds.length
        ? this.supabase.admin
            .from("profiles")
            .select("id, email, full_name")
            .in("id", userIds)
        : Promise.resolve({ data: [] }),
    ]);

    const byOrder = new Map((orders ?? []).map((o) => [o.id, o]));
    const byUser = new Map((profiles ?? []).map((p) => [p.id, p]));

    return rows.map((r) => ({
      ...r,
      order: byOrder.get(r.order_id) ?? null,
      customer: byUser.get(r.user_id) ?? null,
    }));
  }

  /**
   * (G1) Resuelve una solicitud de devolución/cambio desde el panel admin.
   */
  async resolveReturn(
    adminId: string,
    orderId: string,
    decision: "APPROVE_REFUND" | "APPROVE_EXCHANGE" | "REJECT",
    note: string | undefined,
    refund: (orderId: string) => Promise<unknown>,
  ) {
    const { data: ret } = await this.supabase.admin
      .from("order_returns")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();

    if (!ret) {
      throw new NotFoundException(
        "Solicitud de devolución no encontrada para este pedido",
      );
    }
    if (ret.status !== "REQUESTED") {
      throw new BadRequestException("Esta solicitud ya fue resuelta");
    }

    let nextStatus: "APPROVED_REFUNDED" | "APPROVED_EXCHANGED" | "REJECTED";
    if (decision === "APPROVE_REFUND") {
      await refund(orderId);
      nextStatus = "APPROVED_REFUNDED";
    } else if (decision === "APPROVE_EXCHANGE") {
      nextStatus = "APPROVED_EXCHANGED";
    } else {
      nextStatus = "REJECTED";
    }

    const { data: updated, error } = await this.supabase.admin
      .from("order_returns")
      .update({
        status: nextStatus,
        admin_note: note ?? null,
        resolved_by: adminId,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", ret.id)
      .select()
      .single();

    if (error) throw error;

    await this.audit.record(adminId, "ORDER_RETURN_RESOLVED", orderId, {
      returnId: ret.id,
      decision,
      status: nextStatus,
      note: note ?? null,
    });

    return updated;
  }
}
