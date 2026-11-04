import { createHash } from "crypto";
import QRCode from "qrcode";
import type { InvoiceDraft, InvoiceLineDraft } from "./invoicing.types";

const DIAN_NS = {
  invoice: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
  creditNote: "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2",
  cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
  cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
  ext: "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
  ds: "http://www.w3.org/2000/09/xmldsig#",
  xades: "http://uri.etsi.org/01903/v1.3.2#",
  sts: "dian:gov:co:facturaelectronica:Structures-2-1",
};

const DIAN_QR_BASE =
  "https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=";

export interface InvoiceArtifacts {
  cufe: string;
  qrContent: string;
  xml: string;
}

/**
 * Genera un CUFE con el mismo orden de concatenación que exige el anexo
 * técnico de la DIAN. En modo simulado el valor es determinista y verificable
 * dentro de ARShop, pero NO tiene validez fiscal.
 */
export function calculateCufe(draft: InvoiceDraft): string {
  const issueDate = formatDate(draft.issueDate);
  const issueTime = formatTime(draft.issueDate);
  const nit = `${draft.seller.nit}${draft.seller.dv}`;
  const ambiente = draft.seller.environment === "PRODUCCION" ? "1" : "2";
  const technicalKey = draft.numbering.technical_key ?? "";

  const payload = [
    draft.numbering.prefix + String(draft.numbering.number),
    issueDate,
    issueTime,
    money(draft.totals.taxable_base_cop),
    "01",
    money(draft.totals.tax_cop),
    "04",
    "0.00",
    "03",
    "0.00",
    money(draft.totals.total_cop),
    nit,
    draft.buyer.document_number,
    technicalKey,
    ambiente,
  ].join("");

  return createHash("sha384").update(payload, "utf8").digest("hex");
}

export function buildQrContent(draft: InvoiceDraft, cufe: string): string {
  const issueDate = formatDate(draft.issueDate);
  const issueTime = formatTime(draft.issueDate);
  const ambiente = draft.seller.environment === "PRODUCCION" ? "1" : "2";
  return [
    `NroFactura=${draft.numbering.prefix}${draft.numbering.number}`,
    `FecFac=${issueDate}`,
    `HorFac=${issueTime}`,
    `ValFac=${money(draft.totals.taxable_base_cop)}`,
    "CodImp1=01",
    `ValImp1=${money(draft.totals.tax_cop)}`,
    "CodImp2=04",
    "ValImp2=0.00",
    "CodImp3=03",
    "ValImp3=0.00",
    `ValTot=${money(draft.totals.total_cop)}`,
    `NitOFE=${draft.seller.nit}${draft.seller.dv}`,
    `NumAdq=${draft.buyer.document_number}`,
    `ClTec=${draft.numbering.technical_key ?? ""}`,
    `TipoAmbiente=${ambiente}`,
    `CUFE=${cufe}`,
  ].join(";");
}

export async function buildInvoiceArtifacts(
  draft: InvoiceDraft,
): Promise<InvoiceArtifacts> {
  const cufe = calculateCufe(draft);
  // El QR que se imprime en la representación gráfica apunta al validador
  // de la DIAN. El XML conserva además la cadena clave-valor del anexo.
  const qrContent = dianQrUrl(cufe);
  const xml = buildInvoiceXml(draft, cufe, buildQrContent(draft, cufe));
  return { cufe, qrContent, xml };
}

export async function buildQrDataUrl(content: string): Promise<string> {
  return QRCode.toDataURL(content, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 260,
  });
}

export function dianQrUrl(cufe: string): string {
  return `${DIAN_QR_BASE}${cufe}`;
}

export function buildInvoiceXml(
  draft: InvoiceDraft,
  cufe: string,
  qrContent: string,
): string {
  const issueDate = formatDate(draft.issueDate);
  const issueTime = formatTime(draft.issueDate);
  const currency = draft.currency;
  const seller = draft.seller;
  const buyer = draft.buyer;
  const sellerId = `${seller.nit}${seller.dv}`;
  const softwareId = seller.software_id || "ARSHOP-DEMO-001";
  const softwareSecurityCode = createHash("sha384")
    .update(`${softwareId}${seller.software_pin_enc ?? ""}${draft.numbering.prefix}${draft.numbering.number}`)
    .digest("hex");
  const authorizationFrom =
    draft.numbering.valid_from ?? draft.numbering.resolution_date ?? issueDate;
  const authorizationTo = draft.numbering.valid_to ?? issueDate;
  const authorizedFrom = draft.numbering.range_from ?? draft.numbering.number;
  const authorizedTo = draft.numbering.range_to ?? draft.numbering.number;
  const allowanceBaseTotal = draft.lines.reduce((sum, line) => {
    const gross = line.unit_price_cop * line.quantity;
    const rate = line.tax_rate / 100;
    const grossBase = Math.round(gross / (1 + rate));
    const lineBase = line.line_total_cop - line.tax_cop;
    return sum + Math.max(0, grossBase - lineBase);
  }, 0);

  const lines = draft.lines
    .map((line, index) => invoiceLineXml(line, index + 1, currency))
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Documento generado por ARShop en ambiente de ${seller.environment}.
     ${seller.demo_mode ? "MODO DEMOSTRACIÓN: no transmitido a la DIAN ni firmado con certificado real." : "Documento de software propio."} -->
<Invoice xmlns="${DIAN_NS.invoice}"
         xmlns:cac="${DIAN_NS.cac}"
         xmlns:cbc="${DIAN_NS.cbc}"
         xmlns:ext="${DIAN_NS.ext}"
         xmlns:ds="${DIAN_NS.ds}"
         xmlns:xades="${DIAN_NS.xades}"
         xmlns:sts="${DIAN_NS.sts}">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <sts:DianExtensions>
          <sts:InvoiceControl>
            <sts:InvoiceAuthorization>${xml(draft.numbering.resolution_number ?? (seller.environment === "PRODUCCION" ? "AUTORIZACION-DIAN" : "HABILITACION-DIAN"))}</sts:InvoiceAuthorization>
            <sts:AuthorizationPeriod>
              <cbc:StartDate>${xml(authorizationFrom)}</cbc:StartDate>
              <cbc:EndDate>${xml(authorizationTo)}</cbc:EndDate>
            </sts:AuthorizationPeriod>
            <sts:AuthorizedInvoices>
              <sts:Prefix>${xml(draft.numbering.prefix)}</sts:Prefix>
              <sts:From>${authorizedFrom}</sts:From>
              <sts:To>${authorizedTo}</sts:To>
            </sts:AuthorizedInvoices>
          </sts:InvoiceControl>
          <sts:InvoiceSource>
            <cbc:IdentificationCode listAgencyID="6" listAgencyName="United Nations Economic Commission for Europe" listSchemeURI="urn:oasis:names:specification:ubl:codelist:gc:CountryIdentificationCode-2.1">CO</cbc:IdentificationCode>
          </sts:InvoiceSource>
          <sts:SoftwareProvider>
            <sts:ProviderID schemeAgencyID="195" schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)" schemeID="${xml(sellerId)}">${xml(sellerId)}</sts:ProviderID>
            <sts:SoftwareID schemeAgencyID="195" schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)">${xml(softwareId)}</sts:SoftwareID>
          </sts:SoftwareProvider>
          <sts:SoftwareSecurityCode schemeAgencyID="195" schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)">${softwareSecurityCode}</sts:SoftwareSecurityCode>
          <sts:AuthorizationProvider>
            <sts:AuthorizationProviderID schemeAgencyID="195" schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)" schemeID="800197268">800197268</sts:AuthorizationProviderID>
          </sts:AuthorizationProvider>
          <sts:QRCode>${xml(qrContent)}</sts:QRCode>
        </sts:DianExtensions>
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>

  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>10</cbc:CustomizationID>
  <cbc:ProfileID>DIAN 2.1</cbc:ProfileID>
  <cbc:ID>${xml(draft.numbering.prefix)}${draft.numbering.number}</cbc:ID>
  <cbc:UUID schemeName="CUFE-SHA384">${cufe}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode>01</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${draft.lines.length}</cbc:LineCountNumeric>

  <cac:AccountingSupplierParty>
    <cbc:AdditionalAccountID>1</cbc:AdditionalAccountID>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeName="31" schemeAgencyID="195" schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)">${xml(sellerId)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${xml(seller.trade_name)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:ID>${xml(seller.municipality_code)}</cbc:ID>
        <cbc:CityName>${xml(seller.municipality)}</cbc:CityName>
        <cbc:CountrySubentity>${xml(seller.department)}</cbc:CountrySubentity>
        <cbc:CountrySubentityCode>${xml(seller.municipality_code)}</cbc:CountrySubentityCode>
        <cac:AddressLine>
          <cbc:Line>${xml(seller.address)}</cbc:Line>
        </cac:AddressLine>
        <cac:Country>
          <cbc:IdentificationCode>CO</cbc:IdentificationCode>
          <cbc:Name languageID="es">Colombia</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${xml(seller.legal_name)}</cbc:RegistrationName>
        <cbc:CompanyID schemeName="31" schemeAgencyID="195" schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)">${xml(sellerId)}</cbc:CompanyID>
        <cbc:TaxLevelCode>${xml(seller.fiscal_responsibilities.join(";") || "O-48")}</cbc:TaxLevelCode>
        <cac:TaxScheme>
          <cbc:ID>01</cbc:ID>
          <cbc:Name>IVA</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${xml(seller.legal_name)}</cbc:RegistrationName>
        <cbc:CompanyID schemeName="31" schemeAgencyID="195" schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)">${xml(sellerId)}</cbc:CompanyID>
      </cac:PartyLegalEntity>
      <cac:Contact>
        <cbc:Telephone>${xml(seller.phone)}</cbc:Telephone>
        <cbc:ElectronicMail>${xml(seller.email)}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <cac:AccountingCustomerParty>
    <cbc:AdditionalAccountID>${buyer.document_type === "NIT" ? "1" : "2"}</cbc:AdditionalAccountID>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeName="${documentScheme(buyer.document_type)}">${xml(buyer.document_number)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${xml(buyer.legal_name)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:ID>${xml(buyer.municipality_code ?? "")}</cbc:ID>
        <cbc:CityName>${xml(buyer.municipality)}</cbc:CityName>
        <cbc:CountrySubentity>${xml(buyer.department)}</cbc:CountrySubentity>
        <cac:AddressLine>
          <cbc:Line>${xml(buyer.address ?? "")}</cbc:Line>
        </cac:AddressLine>
        <cac:Country>
          <cbc:IdentificationCode>CO</cbc:IdentificationCode>
          <cbc:Name languageID="es">Colombia</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${xml(buyer.legal_name)}</cbc:RegistrationName>
        <cbc:CompanyID>${xml(buyer.document_number)}</cbc:CompanyID>
        <cbc:TaxLevelCode>${xml(buyer.regime)}</cbc:TaxLevelCode>
        <cac:TaxScheme>
          <cbc:ID>ZZ</cbc:ID>
          <cbc:Name>No aplica</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      ${buyer.email ? `<cac:Contact><cbc:ElectronicMail>${xml(buyer.email)}</cbc:ElectronicMail></cac:Contact>` : ""}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${xml(buyer.legal_name)}</cbc:RegistrationName>
        <cbc:CompanyID>${xml(buyer.document_number)}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <cac:PaymentMeans>
    <cbc:ID>${draft.numbering.number}</cbc:ID>
    <cbc:PaymentMeansCode>48</cbc:PaymentMeansCode>
    <cbc:PaymentDueDate>${issueDate}</cbc:PaymentDueDate>
  </cac:PaymentMeans>

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${money(draft.totals.tax_cop)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${money(draft.totals.taxable_base_cop)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">${money(draft.totals.tax_cop)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:Percent>19.00</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>01</cbc:ID>
          <cbc:Name>IVA</cbc:Name>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${money(draft.totals.taxable_base_cop)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${money(draft.totals.taxable_base_cop)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${money(draft.totals.total_cop)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="${currency}">${money(allowanceBaseTotal)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="${currency}">${money(draft.totals.total_cop)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

${lines}

  <!-- Firma XAdES-EPES de demostración. No reemplaza una firma con certificado
       digital acreditado por ONAC. -->
  <ds:Signature Id="ARShopSignature">
    <ds:SignedInfo>
      <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
      <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
      <ds:Reference URI="#ARShopInvoice">
        <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
        <ds:DigestValue>${createHash("sha256").update(cufe).digest("base64")}</ds:DigestValue>
      </ds:Reference>
    </ds:SignedInfo>
    <ds:SignatureValue>${createHash("sha256").update(`${cufe}:DEMO`).digest("base64")}</ds:SignatureValue>
    <ds:KeyInfo>
      <ds:X509Data>
        <ds:X509SubjectName>CN=ARShop Demo, O=ARShop S.A.S. (DEMO), C=CO</ds:X509SubjectName>
      </ds:X509Data>
    </ds:KeyInfo>
    <ds:Object>
      <xades:QualifyingProperties Target="#ARShopSignature">
        <xades:SignedProperties>
          <xades:SignedSignatureProperties>
            <xades:SigningTime>${draft.issueDate.toISOString()}</xades:SigningTime>
            <xades:SigningCertificate>
              <xades:Cert>
                <xades:CertDigest>
                  <ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
                  <ds:DigestValue>DEMO-SIN-CERTIFICADO-REAL</ds:DigestValue>
                </xades:CertDigest>
              </xades:Cert>
            </xades:SigningCertificate>
          </xades:SignedSignatureProperties>
        </xades:QualifyingProperties>
      </ds:Object>
    </ds:Signature>
</Invoice>`;
}

function invoiceLineXml(
  line: InvoiceLineDraft,
  index: number,
  currency: string,
): string {
  // Los precios de ARShop son IVA incluido; UBL/DIAN exige la base gravable
  // (sin impuestos) en LineExtensionAmount, PriceAmount y AllowanceCharge.
  const gross = line.unit_price_cop * line.quantity;
  const rate = line.tax_rate / 100;
  const grossBase = Math.round(gross / (1 + rate));
  const lineBase = line.line_total_cop - line.tax_cop;
  const discountBase = Math.max(0, grossBase - lineBase);
  const unitBase = line.quantity > 0 ? grossBase / line.quantity : 0;

  return `  <cac:InvoiceLine>
    <cbc:ID>${index}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="94">${line.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${currency}">${money(lineBase)}</cbc:LineExtensionAmount>
    ${discountBase > 0
      ? `<cac:AllowanceCharge>
      <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
      <cbc:AllowanceChargeReason>Descuento</cbc:AllowanceChargeReason>
      <cbc:Amount currencyID="${currency}">${money(discountBase)}</cbc:Amount>
    </cac:AllowanceCharge>`
      : ""}
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${currency}">${money(line.tax_cop)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${currency}">${money(lineBase)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${currency}">${money(line.tax_cop)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:Percent>${line.tax_rate.toFixed(2)}</cbc:Percent>
          <cac:TaxScheme>
            <cbc:ID>${line.tax_scheme}</cbc:ID>
            <cbc:Name>IVA</cbc:Name>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description>${xml(line.description)}</cbc:Description>
      <cac:SellersItemIdentification>
        <cbc:ID>${xml(line.order_item_id ?? `ITEM-${index}`)}</cbc:ID>
      </cac:SellersItemIdentification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${currency}">${money(unitBase)}</cbc:PriceAmount>
      <cbc:BaseQuantity unitCode="94">1</cbc:BaseQuantity>
    </cac:Price>
  </cac:InvoiceLine>`;
}

function documentScheme(type: string): string {
  switch (type) {
    case "NIT":
      return "31";
    case "CE":
      return "22";
    case "PP":
      return "41";
    default:
      return "13";
  }
}

export interface CreditNoteXmlInput {
  invoice: {
    full_number: string | null;
    cufe: string | null;
    total_cop: number;
    seller_snapshot: Record<string, unknown>;
    buyer_snapshot: Record<string, unknown>;
  };
  number: number;
  prefix: string;
  amountCop: number;
  reason: string;
  issueDate: Date;
  technicalKey: string | null;
  environment: string;
}

export function buildCreditNoteXml(input: CreditNoteXmlInput): {
  cufe: string;
  xml: string;
} {
  const seller = input.invoice.seller_snapshot as {
    legal_name?: string;
    nit?: string;
    dv?: string;
    trade_name?: string;
  };
  const buyer = input.invoice.buyer_snapshot as {
    legal_name?: string;
    document_type?: string;
    document_number?: string;
  };
  const cufe = createHash("sha384")
    .update(
      [
        `${input.prefix}${input.number}`,
        formatDate(input.issueDate),
        input.invoice.full_number ?? "",
        input.invoice.cufe ?? "",
        money(input.amountCop),
        input.technicalKey ?? "",
        input.environment,
      ].join(""),
    )
    .digest("hex");

  const fullNumber = `${input.prefix}${input.number}`;
  const taxableBase = Math.round(input.amountCop / 1.19);
  const tax = input.amountCop - taxableBase;
  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Nota crédito de demostración generada por ARShop. No transmitida a la DIAN. -->
<CreditNote xmlns="${DIAN_NS.creditNote}"
            xmlns:cac="${DIAN_NS.cac}"
            xmlns:cbc="${DIAN_NS.cbc}"
            xmlns:sts="${DIAN_NS.sts}">
  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>20</cbc:CustomizationID>
  <cbc:ProfileID>DIAN 2.1</cbc:ProfileID>
  <cbc:ID>${xml(fullNumber)}</cbc:ID>
  <cbc:UUID schemeName="CUDE-SHA384">${cufe}</cbc:UUID>
  <cbc:IssueDate>${formatDate(input.issueDate)}</cbc:IssueDate>
  <cbc:IssueTime>${formatTime(input.issueDate)}</cbc:IssueTime>
  <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeName="31">${xml(`${seller.nit ?? ""}${seller.dv ?? ""}`)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${xml(seller.legal_name ?? seller.trade_name ?? "ARShop")}</cbc:Name></cac:PartyName>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeName="${documentScheme(buyer.document_type ?? "CC")}">${xml(buyer.document_number ?? "")}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${xml(buyer.legal_name ?? "Consumidor final")}</cbc:Name></cac:PartyName>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${xml(input.invoice.full_number ?? "")}</cbc:ID>
      <cbc:UUID schemeName="CUFE-SHA384">${xml(input.invoice.cufe ?? "")}</cbc:UUID>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>
  <cac:DiscrepancyResponse>
    <cbc:ReferenceID>${xml(input.invoice.full_number ?? "")}</cbc:ReferenceID>
    <cbc:ResponseCode>2</cbc:ResponseCode>
    <cbc:Description>${xml(input.reason)}</cbc:Description>
  </cac:DiscrepancyResponse>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="COP">${money(tax)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="COP">${money(taxableBase)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="COP">${money(tax)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:Percent>19.00</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>01</cbc:ID>
          <cbc:Name>IVA</cbc:Name>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="COP">${money(taxableBase)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="COP">${money(taxableBase)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="COP">${money(input.amountCop)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="COP">${money(input.amountCop)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</CreditNote>`;

  return { cufe, xml: xmlBody };
}

export function formatDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function formatTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}:${get("second")}-05:00`;
}

export function money(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

export function xml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
