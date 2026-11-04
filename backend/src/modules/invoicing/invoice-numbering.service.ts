import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseService } from "../../supabase/supabase.service";
import type { CreateNumberingRangeDto, UpdateNumberingRangeDto } from "./dto/numbering.dto";

export interface NumberingAssignment {
  number: number;
  prefix: string;
  technical_key: string | null;
  resolution_number: string | null;
  resolution_date?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  range_from?: number | null;
  range_to?: number | null;
}

@Injectable()
export class InvoiceNumberingService {
  private readonly logger = new Logger(InvoiceNumberingService.name);

  constructor(private readonly supabase: SupabaseService) {}

  private table() {
    return this.supabase.admin.from("invoice_numbering_ranges");
  }

  async list() {
    const { data, error } = await this.table()
      .select("*")
      .order("document_type", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async create(dto: CreateNumberingRangeDto) {
    if (dto.rangeTo < dto.rangeFrom) {
      throw new BadRequestException("rangeTo debe ser mayor o igual a rangeFrom");
    }
    const { data, error } = await this.table()
      .insert({
        document_type: dto.documentType,
        prefix: dto.prefix.trim().toUpperCase(),
        resolution_number: dto.resolutionNumber?.trim() || null,
        resolution_date: dto.resolutionDate || null,
        range_from: dto.rangeFrom,
        range_to: dto.rangeTo,
        valid_from: dto.validFrom || null,
        valid_to: dto.validTo || null,
        technical_key: dto.technicalKey?.trim() || null,
        active: dto.active ?? true,
      })
      .select()
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new BadRequestException("Ya existe un rango con ese tipo, prefijo y desde.");
      }
      throw error;
    }
    return data;
  }

  async update(id: string, dto: UpdateNumberingRangeDto) {
    const patch: Record<string, unknown> = {};
    if (dto.documentType !== undefined) patch.document_type = dto.documentType;
    if (dto.prefix !== undefined) patch.prefix = dto.prefix.trim().toUpperCase();
    if (dto.resolutionNumber !== undefined) {
      patch.resolution_number = dto.resolutionNumber.trim() || null;
    }
    if (dto.resolutionDate !== undefined) patch.resolution_date = dto.resolutionDate || null;
    if (dto.rangeFrom !== undefined) patch.range_from = dto.rangeFrom;
    if (dto.rangeTo !== undefined) patch.range_to = dto.rangeTo;
    if (dto.validFrom !== undefined) patch.valid_from = dto.validFrom || null;
    if (dto.validTo !== undefined) patch.valid_to = dto.validTo || null;
    if (dto.technicalKey !== undefined) patch.technical_key = dto.technicalKey.trim() || null;
    if (dto.active !== undefined) patch.active = dto.active;

    const { data, error } = await this.table()
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    if (!data) throw new NotFoundException("Rango de numeración no encontrado");
    return data;
  }

  async getActive(documentType: "FV" | "NC" | "ND" = "FV") {
    const { data, error } = await this.table()
      .select("*")
      .eq("document_type", documentType)
      .eq("active", true)
      .order("valid_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new BadRequestException(
        `No hay un rango de numeración activo para ${documentType}. Configúralo en Facturación → Configuración.`,
      );
    }
    return data;
  }

  /**
   * Asigna el siguiente consecutivo con la RPC `next_invoice_number`
   * (FOR UPDATE). Si la migración aún no está aplicada intenta un update
   * optimista como fallback, sin comprometer la unicidad por prefijo+número.
   */
  async next(documentType: "FV" | "NC" | "ND" = "FV"): Promise<NumberingAssignment> {
    const range = await this.getActive(documentType);

    const { data, error } = await this.supabase.admin.rpc("next_invoice_number", {
      p_range_id: range.id,
    });

    if (!error) {
      const row = (Array.isArray(data) ? data[0] : data) as
        | { number?: number; prefix?: string; technical_key?: string | null; resolution_number?: string | null }
        | null;
      if (row?.number != null) {
        return {
          number: Number(row.number),
          prefix: String(row.prefix ?? range.prefix),
          technical_key: row.technical_key ?? range.technical_key ?? null,
          resolution_number: row.resolution_number ?? range.resolution_number ?? null,
          resolution_date: range.resolution_date ?? null,
          valid_from: range.valid_from ?? null,
          valid_to: range.valid_to ?? null,
          range_from: range.range_from ?? null,
          range_to: range.range_to ?? null,
        };
      }
    } else {
      this.logger.warn(`next_invoice_number RPC falló: ${error.message}`);
    }

    return this.nextOptimistic(range);
  }

  private async nextOptimistic(range: {
    id: string;
    prefix: string;
    range_from: number;
    range_to: number;
    current_number: number;
    technical_key: string | null;
    resolution_number: string | null;
    resolution_date?: string | null;
    valid_from?: string | null;
    valid_to?: string | null;
  }): Promise<NumberingAssignment> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: current, error: readErr } = await this.table()
        .select("current_number")
        .eq("id", range.id)
        .maybeSingle();
      if (readErr) throw readErr;
      if (!current) throw new NotFoundException("Rango de numeración no encontrado");

      const nextNumber = Math.max(
        Number(current.current_number) + 1,
        Number(range.range_from),
      );
      if (nextNumber > Number(range.range_to)) {
        throw new BadRequestException(`El rango ${range.prefix} está agotado.`);
      }

      const { data: updated, error: upErr } = await this.table()
        .update({ current_number: nextNumber })
        .eq("id", range.id)
        .eq("current_number", current.current_number)
        .select("current_number")
        .maybeSingle();

      if (!upErr && updated) {
        return {
          number: nextNumber,
          prefix: range.prefix,
          technical_key: range.technical_key,
          resolution_number: range.resolution_number,
          resolution_date: range.resolution_date ?? null,
          valid_from: range.valid_from ?? null,
          valid_to: range.valid_to ?? null,
          range_from: range.range_from,
          range_to: range.range_to,
        };
      }
    }
    throw new BadRequestException(
      "No se pudo asignar un número consecutivo (concurrencia). Intenta de nuevo.",
    );
  }
}
