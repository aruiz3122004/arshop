import { Injectable } from "@nestjs/common";
import {
  buildInvoiceArtifacts,
  buildQrDataUrl,
  calculateCufe,
  dianQrUrl,
} from "../invoice-xml.builder";
import type {
  InvoiceDraft,
  InvoiceProvider,
  IssueInvoiceResult,
} from "../invoicing.types";

/**
 * Proveedor de demostración. Genera XML UBL 2.1, CUFE SHA-384 y QR con la
 * misma estructura del anexo técnico, pero NO firma con certificado real ni
 * transmite a la DIAN. Simula una respuesta de aceptación de habilitación.
 */
@Injectable()
export class SimulatedDianProvider implements InvoiceProvider {
  readonly id = "DIAN_SIMULATED" as const;

  async issue(input: InvoiceDraft): Promise<IssueInvoiceResult> {
    const artifacts = await buildInvoiceArtifacts(input);
    const qrDataUrl = await buildQrDataUrl(dianQrUrl(artifacts.cufe));
    return {
      status: "ISSUED",
      cufe: artifacts.cufe,
      xml: artifacts.xml,
      qrDataUrl,
      trackId: `HAB-${input.numbering.prefix}${input.numbering.number}-${Date.now().toString(36).toUpperCase()}`,
      dianStatusCode: "00",
      dianMessage:
        "Documento validado en ambiente de habilitación (simulación local, sin transmisión a la DIAN).",
      acceptedAt: new Date(),
    };
  }
}

/**
 * Modo “Facturación Gratuita DIAN” (asistido, $0): genera el paquete XML y
 * deja la factura en PENDING_MANUAL. El operador la radica en el portal de la
 * DIAN y luego registra número/CUFE con “Marcar como emitida”.
 */
@Injectable()
export class DianFreeProvider implements InvoiceProvider {
  readonly id = "DIAN_FREE" as const;

  async issue(input: InvoiceDraft): Promise<IssueInvoiceResult> {
    const artifacts = await buildInvoiceArtifacts(input);
    return {
      status: "PENDING_MANUAL",
      cufe: artifacts.cufe,
      xml: artifacts.xml,
      dianMessage:
        "Paquete generado. Radica el XML en el portal Facturación Gratuita DIAN y registra el CUFE/número aceptado.",
    };
  }
}

/**
 * Modo software propio (dian-kit). Se deja el adaptador aislado para no
 * acoplar el dominio a una dependencia joven. Requiere certificado .p12,
 * software ID/PIN y habilitación real.
 */
@Injectable()
export class DianOwnProvider implements InvoiceProvider {
  readonly id = "DIAN_OWN" as const;

  async issue(input: InvoiceDraft): Promise<IssueInvoiceResult> {
    const artifacts = await buildInvoiceArtifacts(input);
    return {
      status: "FAILED",
      cufe: calculateCufe(input),
      xml: artifacts.xml,
      dianStatusCode: "CONFIG",
      dianMessage:
        "El modo DIAN_OWN requiere certificado .p12, software ID/PIN y el adaptador @dian-kit configurado. La factura quedó generada localmente para revisión.",
    };
  }
}

@Injectable()
export class FactusProvider implements InvoiceProvider {
  readonly id = "FACTUS" as const;

  async issue(input: InvoiceDraft): Promise<IssueInvoiceResult> {
    const artifacts = await buildInvoiceArtifacts(input);
    return {
      status: "FAILED",
      cufe: calculateCufe(input),
      xml: artifacts.xml,
      dianStatusCode: "CONFIG",
      dianMessage:
        "El proveedor Factus no está configurado (API key/sandbox). La factura quedó generada localmente.",
    };
  }
}
