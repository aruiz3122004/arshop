"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Hash,
  Loader2,
  QrCode,
  ShieldCheck,
  Timer,
  User as UserIcon,
  Wand2,
  X,
} from "lucide-react";
import {
  apiDeliveryConfirm,
  apiDeliveryGetClientInfo,
  apiDeliveryGetOrder,
  apiDeliverySimulate,
  apiDeliveryVerifyClientCode,
  type DocumentType,
} from "@/lib/api";

export default function DeliveryOrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [simulateOpen, setSimulateOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);

  const [form, setForm] = useState({
    receiverName: "",
    documentType: "CC" as DocumentType,
    documentNumber: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    try {
      const data = await apiDeliveryGetOrder(params.id);
      setOrder(data);
      const pref = data.receiver_prefilled;
      if (pref && !form.receiverName) {
        setForm({
          receiverName: pref.nombreReceptor ?? "",
          documentType: pref.tipoDocumento ?? "CC",
          documentNumber: pref.numeroDocumento ?? "",
        });
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (loading) {
    return (
      <div className="pt-10 text-center">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-graphite" />
      </div>
    );
  }
  if (err) {
    return <p className="pt-4 text-red-600">{err}</p>;
  }
  if (!order) return null;

  const qrOk = Boolean(order.qr_consumed_at);
  const dataOk = Boolean(form.receiverName && form.documentNumber);
  // Sólo se llega a este botón con el QR (o el código) ya validado; el
  // backend exige ese paso antes de aceptar la confirmación.
  const canSend = qrOk && dataOk && order.status !== "DELIVERED";
  // Si el QR trajo los datos del cliente, el repartidor no debe poder
  // reescribirlos: el QR es la fuente de verdad de quién recibe.
  const prefilledFromQr =
    qrOk &&
    Boolean(
      order.receiver_prefilled?.nombreReceptor &&
        order.receiver_prefilled?.numeroDocumento,
    );
  const lockReceiverFields = prefilledFromQr;

  async function sendDelivery() {
    setSubmitting(true);
    try {
      await apiDeliveryConfirm(order.id, {
        receiverName: form.receiverName,
        documentType: form.documentType,
        documentNumber: form.documentNumber,
        source: "qr",
      });
      router.push("/domiciliario/pedidos");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <Link
        href="/domiciliario/pedidos"
        className="caption text-[11px] uppercase tracking-wider text-graphite"
      >
        ← Volver
      </Link>
      <h2 className="font-serif text-2xl text-carbon mt-2">
        Pedido #{order.id.slice(0, 8)}
      </h2>
      <p className="caption text-[11px] text-graphite uppercase">
        Estado actual: {order.status}
        {order.delivery_confirmation === "PENDING_CLIENT" && (
          <span className="ml-2 inline-flex items-center gap-1 border border-amber-400 bg-amber-50 text-amber-700 px-2 py-0.5">
            <Timer size={10} /> Esperando cliente
          </span>
        )}
        {order.delivery_confirmation === "DISPUTED" && (
          <span className="ml-2 inline-flex items-center gap-1 border border-red-400 bg-red-50 text-red-700 px-2 py-0.5">
            Disputado
          </span>
        )}
      </p>

      {(order.customer?.full_name || order.customer?.email) && (
        <div className="mt-4 border border-smoke p-4">
          <h3 className="font-medium text-carbon flex items-center gap-2">
            <UserIcon size={16} /> Cliente
          </h3>
          <p className="text-sm">{order.customer?.full_name ?? "—"}</p>
          {order.customer?.email && (
            <p className="caption text-[11px] text-graphite">
              {order.customer.email}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 border border-smoke p-4">
        <h3 className="font-medium text-carbon">Dirección</h3>
        <p className="text-sm">{order.shipping_address.recipientName ?? "—"}</p>
        <p className="text-sm">{order.shipping_address.line1}</p>
        {order.shipping_address.line2 && <p className="text-sm">{order.shipping_address.line2}</p>}
        <p className="text-sm">
          {order.shipping_address.neighborhood}, {order.shipping_address.city},{" "}
          {order.shipping_address.department}
        </p>
        <p className="caption text-[11px] text-graphite mt-2">
          Tel: <a className="underline" href={`tel:${order.shipping_phone}`}>{order.shipping_phone}</a>
        </p>
      </div>

      <div className="mt-5 border border-smoke p-4">
        <h3 className="font-medium text-carbon">Productos</h3>
        <ul className="mt-2 divide-y divide-smoke">
          {(order.items ?? []).map((i: any) => (
            <li key={i.id} className="py-2 flex justify-between text-sm">
              <span>
                {i.product_name_snapshot} <span className="text-graphite">· {i.variant_label}</span>
              </span>
              <span>×{i.quantity}</span>
            </li>
          ))}
        </ul>
      </div>

      {order.status === "DELIVERED" ? (
        <div className="mt-6 border border-green-500 bg-green-50 p-4">
          <div className="flex items-center gap-2 text-green-700 font-medium">
            <CheckCircle2 size={18} /> Pedido entregado
          </div>
          {order.recibido?.[0] && (
            <p className="caption text-[12px] text-green-700 mt-2">
              Recibido por {order.recibido[0].nombre_receptor} · {order.recibido[0].tipo_documento}{" "}
              {order.recibido[0].numero_documento} · {order.recibido[0].fecha}{" "}
              {order.recibido[0].hora}
            </p>
          )}
        </div>
      ) : order.delivery_confirmation === "PENDING_CLIENT" ? (
        <div className="mt-6 border border-amber-400 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-amber-800 font-medium">
            <Timer size={18} /> Esperando confirmación del cliente
          </div>
          <p className="caption text-[12px] text-amber-800 mt-2">
            Marcaste esta entrega como simulada. El cliente tiene 48 h para
            aceptarla o reportarla; si no responde, el pedido pasa a disputa y
            lo revisa un administrador.
          </p>
          {order.delivery_auto_confirm_at && (
            <p className="caption text-[11px] text-amber-800 mt-1">
              Pasa a disputa el{" "}
              {new Date(order.delivery_auto_confirm_at).toLocaleString("es-CO")}
            </p>
          )}
          {/* Si el cliente aparece después con su QR o su código, esa prueba
              cierra la entrega de inmediato y apaga la ventana. */}
          <Link
            href="/domiciliario/scan"
            className="mt-3 inline-flex items-center gap-1 border border-amber-400 bg-paper px-3 py-1.5 text-[11px] uppercase tracking-wider text-amber-800 hover:border-carbon"
          >
            <QrCode size={12} /> El cliente apareció: escanear su QR
          </Link>
        </div>
      ) : order.delivery_confirmation === "DISPUTED" ? (
        <div className="mt-6 border border-red-400 bg-red-50 p-4">
          <div className="flex items-center gap-2 text-red-800 font-medium">
            Entrega en disputa
          </div>
          <p className="caption text-[12px] text-red-800 mt-2">
            El cliente no confirmó la entrega simulada o reportó un problema. Un
            administrador revisará el caso. No puedes volver a marcar este
            pedido como entregado hasta que se resuelva.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <CheckCard
              ok={qrOk}
              icon={QrCode}
              label="QR escaneado"
              hint={qrOk ? "El cliente validó su QR" : "Pendiente de escaneo"}
            />
            <CheckCard
              ok={dataOk}
              icon={ShieldCheck}
              label="Datos receptor"
              hint={dataOk ? "Completos" : "Diligencia los campos"}
            />
          </div>

          {!qrOk ? (
            /*
              Sin QR ni código no hay nada que "enviar": el backend rechaza
              confirmar una entrega sin validación del cliente. El único
              camino es simularla, y el pedido quedará pendiente de que el
              cliente lo acepte en 48 h.
            */
            <div className="mt-6">
              <p className="border border-smoke bg-stone/20 px-4 py-3 text-[12px] text-graphite">
                Pídele al cliente su QR o su código de 4 dígitos: con eso el
                pedido se cierra de inmediato. Simula la entrega sólo si no
                tiene cómo mostrarte ninguno de los dos.
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/domiciliario/scan"
                  className="inline-flex items-center gap-2 bg-carbon text-paper px-4 py-2 text-[12px] uppercase tracking-wider"
                >
                  <QrCode size={14} /> Abrir escáner
                </Link>
                <button
                  type="button"
                  onClick={() => setCodeOpen(true)}
                  className="inline-flex items-center gap-2 border border-carbon px-4 py-2 text-[12px] uppercase tracking-wider"
                >
                  <Hash size={14} /> Digitar código
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSimulateOpen(true)}
                className="mt-4 w-full border border-smoke px-5 py-3 text-[12px] uppercase tracking-wider hover:border-carbon transition-colors"
              >
                Simular entrega (receptor sin QR)
              </button>
              <p className="caption text-[11px] text-graphite mt-2">
                El pedido no se marca entregado: el cliente recibe un aviso y
                tiene 48 h para confirmarlo. Si no responde, pasa a disputa.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-6 border border-smoke p-4 space-y-3">
                <h3 className="font-medium text-carbon">Datos del receptor</h3>
                {lockReceiverFields && (
                  <p className="caption text-[11px] text-graphite">
                    Los cargó el cliente en su QR. No se pueden modificar.
                  </p>
                )}
                <input
                  placeholder="¿Quién recibió? (Ej: Patricia Hernández)"
                  value={form.receiverName}
                  readOnly={lockReceiverFields}
                  onChange={(e) => setForm({ ...form, receiverName: e.target.value })}
                  className={`w-full border border-smoke px-3 py-2 text-sm ${
                    lockReceiverFields ? "bg-stone/20 text-graphite" : ""
                  }`}
                />
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={form.documentType}
                    disabled={lockReceiverFields}
                    onChange={(e) =>
                      setForm({ ...form, documentType: e.target.value as DocumentType })
                    }
                    className={`border border-smoke px-2 py-2 text-sm ${
                      lockReceiverFields ? "bg-stone/20 text-graphite" : ""
                    }`}
                  >
                    <option value="CC">CC</option>
                    <option value="CE">CE</option>
                    <option value="PP">PP</option>
                    <option value="NIT">NIT</option>
                  </select>
                  <input
                    className={`col-span-2 border border-smoke px-3 py-2 text-sm ${
                      lockReceiverFields ? "bg-stone/20 text-graphite" : ""
                    }`}
                    readOnly={lockReceiverFields}
                    placeholder="N° documento (Ej: 72561891)"
                    value={form.documentNumber}
                    onChange={(e) =>
                      setForm({ ...form, documentNumber: e.target.value.replace(/\D/g, "") })
                    }
                  />
                </div>
                {!dataOk && (
                  <p className="caption text-[11px] text-graphite">
                    El QR no trajo los datos del receptor. Anótalos tú antes de
                    cerrar la entrega.
                  </p>
                )}
              </div>

              <div className="mt-6">
                <button
                  disabled={!canSend || submitting}
                  onClick={sendDelivery}
                  className="w-full bg-carbon text-paper px-5 py-3 text-[12px] uppercase tracking-wider disabled:opacity-50"
                >
                  {submitting ? "Enviando…" : "Marcar como entregada"}
                </button>
                <p className="caption text-[11px] text-graphite mt-2">
                  El cliente ya validó el QR (o su código): la entrega queda
                  cerrada y no necesita aceptación posterior.
                </p>
              </div>
            </>
          )}
        </>
      )}

      {simulateOpen && (
        <SimulateModal
          orderId={order.id}
          defaultReceiver={form}
          onClose={() => setSimulateOpen(false)}
          onDone={() => router.push("/domiciliario/pedidos")}
        />
      )}

      {codeOpen && (
        <ClientCodeModal
          orderId={order.id}
          onClose={() => setCodeOpen(false)}
          onDone={async () => {
            setCodeOpen(false);
            await refresh();
          }}
        />
      )}
    </section>
  );
}

function ClientCodeModal({
  orderId,
  onClose,
  onDone,
}: {
  orderId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await apiDeliveryVerifyClientCode(orderId, code);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm bg-paper border border-carbon">
        <div className="flex items-center justify-between border-b border-smoke px-5 py-3">
          <h3 className="font-serif text-lg text-carbon">Código del cliente</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-graphite">
            Pide al receptor que te dicte los 4 dígitos que aparecen en su app.
            Equivale a escanear el QR.
          </p>
          <input
            required
            autoFocus
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            placeholder="····"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-full border border-smoke px-3 py-3 font-mono text-center text-3xl tracking-[0.5em]"
          />
          {err && (
            <p className="text-sm text-red-600 border border-red-200 bg-red-50 px-3 py-2">
              {err}
            </p>
          )}
        </div>
        <div className="px-5 py-3 border-t border-smoke flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-[12px] border border-smoke">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy || code.length !== 4}
            className="inline-flex items-center gap-2 px-4 py-2 text-[12px] bg-carbon text-paper disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Verificar
          </button>
        </div>
      </form>
    </div>
  );
}

function CheckCard({
  ok,
  icon: Icon,
  label,
  hint,
}: {
  ok: boolean;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  hint: string;
}) {
  return (
    <div
      className={`p-4 border ${ok ? "border-green-500 bg-green-50" : "border-smoke bg-paper"}`}
    >
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="text-green-600" size={18} />
        ) : (
          <Circle className="text-graphite" size={18} />
        )}
        <span className="caption uppercase tracking-wider text-[11px] font-medium">
          {label}
        </span>
      </div>
      <p className="mt-1 text-[12px] text-graphite flex items-center gap-1">
        <Icon size={12} /> {hint}
      </p>
    </div>
  );
}

function SimulateModal({
  orderId,
  defaultReceiver,
  onClose,
  onDone,
}: {
  orderId: string;
  defaultReceiver: {
    receiverName: string;
    documentType: DocumentType;
    documentNumber: string;
  };
  onClose: () => void;
  onDone: () => void;
}) {
  const [pin, setPin] = useState("");
  const [skipPin, setSkipPin] = useState(false);
  const [form, setForm] = useState(defaultReceiver);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!skipPin && pin.length !== 4) {
      setErr("Escribe tu PIN de 4 dígitos o marca que no lo tienes a mano.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await apiDeliverySimulate(orderId, {
        ...(skipPin ? { skipPin: true } : { pin }),
        receiverName: form.receiverName,
        documentType: form.documentType,
        documentNumber: form.documentNumber,
      });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-md bg-paper border border-carbon">
        <div className="flex items-center justify-between border-b border-smoke px-5 py-3">
          <h3 className="font-serif text-lg text-carbon">Simular entrega</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div className="border border-amber-400 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            <p className="font-medium">Entrega simulada</p>
            <p className="mt-1">
              El pedido <strong>no</strong> queda entregado todavía. El cliente
              tiene <strong>48 h</strong> para confirmarlo: le llega un aviso
              ahora y otro a las 24 h. Si no responde, el pedido pasa a{" "}
              <strong>disputa</strong> y lo revisa un administrador.
            </p>
          </div>

          <button
            type="button"
            onClick={async () => {
              setErr(null);
              try {
                const info = await apiDeliveryGetClientInfo(orderId);
                setForm({
                  receiverName: info.fullName ?? form.receiverName,
                  documentType: (info.documentType ?? form.documentType) as DocumentType,
                  documentNumber: info.documentNumber ?? form.documentNumber,
                });
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
            className="inline-flex items-center gap-1 border border-smoke bg-paper px-3 py-1.5 text-[11px] uppercase tracking-wider hover:border-carbon"
          >
            <Wand2 size={12} /> Rellenar con datos del cliente
          </button>

          <input
            required
            placeholder="¿Quién recibió?"
            value={form.receiverName}
            onChange={(e) => setForm({ ...form, receiverName: e.target.value })}
            className="w-full border border-smoke px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-3 gap-2">
            <select
              value={form.documentType}
              onChange={(e) => setForm({ ...form, documentType: e.target.value as DocumentType })}
              className="border border-smoke px-2 py-2 text-sm"
            >
              <option value="CC">CC</option>
              <option value="CE">CE</option>
              <option value="PP">PP</option>
              <option value="NIT">NIT</option>
            </select>
            <input
              required
              className="col-span-2 border border-smoke px-3 py-2 text-sm"
              placeholder="N° documento"
              value={form.documentNumber}
              onChange={(e) =>
                setForm({ ...form, documentNumber: e.target.value.replace(/\D/g, "") })
              }
            />
          </div>

          {/*
            El PIN es la firma del repartidor, no del cliente. Si no lo tiene a
            mano puede omitirlo, pero el pedido seguirá necesitando la
            confirmación del cliente: sin ella no se marca entregado.
          */}
          <label className="flex items-start gap-2 border border-smoke bg-stone/20 px-3 py-2 text-[12px] text-carbon cursor-pointer">
            <input
              type="checkbox"
              checked={skipPin}
              onChange={(e) => {
                setSkipPin(e.target.checked);
                if (e.target.checked) setPin("");
              }}
              className="mt-0.5 accent-carbon"
            />
            <span>
              No tengo mi PIN a mano — simular sólo con los datos del receptor
            </span>
          </label>

          {skipPin ? (
            <p className="caption text-[11px] text-graphite">
              Se registrará la entrega sin tu PIN. Queda en el historial de
              auditoría.
            </p>
          ) : (
            <input
              required
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              placeholder="PIN de 4 dígitos"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="w-full border border-smoke px-3 py-2 font-mono tracking-widest text-center text-lg"
            />
          )}
          {err && (
            <p className="text-sm text-red-600 border border-red-200 bg-red-50 px-3 py-2">{err}</p>
          )}
        </div>
        <div className="px-5 py-3 border-t border-smoke flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-[12px] border border-smoke">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy || (!skipPin && pin.length !== 4)}
            className="inline-flex items-center gap-2 px-4 py-2 text-[12px] bg-carbon text-paper disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Simular entrega
          </button>
        </div>
      </form>
    </div>
  );
}
