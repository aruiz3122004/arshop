import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { SupabaseService } from "../../supabase/supabase.service";
import type { CreateAddressDto, UpdateAddressDto } from "./dto/address.dto";

export interface AddressRow {
  id: string;
  user_id: string;
  label: string;
  recipient_name: string | null;
  line1: string;
  line2: string | null;
  neighborhood: string;
  city: string;
  department: string;
  postal_code: string | null;
  country: string;
  phone: string;
  notes: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class AddressesService {
  constructor(private readonly supabase: SupabaseService) {}

  async list(userId: string): Promise<AddressRow[]> {
    const { data, error } = await this.supabase.admin
      .from("addresses")
      .select("*")
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async getDefault(userId: string): Promise<AddressRow | null> {
    const { data, error } = await this.supabase.admin
      .from("addresses")
      .select("*")
      .eq("user_id", userId)
      .eq("is_default", true)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findOne(userId: string, id: string): Promise<AddressRow> {
    const { data, error } = await this.supabase.admin
      .from("addresses")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Dirección no encontrada");
    return data;
  }

  async create(userId: string, dto: CreateAddressDto): Promise<AddressRow> {
    const payload = this.toRowPayload(userId, dto);

    // La primera dirección del usuario queda default salvo que explícitamente diga lo contrario.
    const existing = await this.list(userId);
    if (existing.length === 0 && dto.isDefault !== false) {
      payload.is_default = true;
    }

    const { data, error } = await this.supabase.admin
      .from("addresses")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateAddressDto,
  ): Promise<AddressRow> {
    await this.findOne(userId, id); // valida ownership

    const payload: Record<string, unknown> = {};
    if (dto.label !== undefined) payload.label = dto.label;
    if (dto.recipientName !== undefined) payload.recipient_name = dto.recipientName;
    if (dto.line1 !== undefined) payload.line1 = dto.line1;
    if (dto.line2 !== undefined) payload.line2 = dto.line2 ?? null;
    if (dto.neighborhood !== undefined) payload.neighborhood = dto.neighborhood;
    if (dto.city !== undefined) payload.city = dto.city;
    if (dto.department !== undefined) payload.department = dto.department;
    if (dto.postalCode !== undefined) payload.postal_code = dto.postalCode ?? null;
    if (dto.country !== undefined) payload.country = dto.country || "CO";
    if (dto.phone !== undefined) payload.phone = dto.phone;
    if (dto.notes !== undefined) payload.notes = dto.notes ?? null;
    if (dto.isDefault !== undefined) payload.is_default = dto.isDefault;

    const { data, error } = await this.supabase.admin
      .from("addresses")
      .update(payload)
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    await this.findOne(userId, id);
    const { error } = await this.supabase.admin
      .from("addresses")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  }

  async setDefault(userId: string, id: string): Promise<AddressRow> {
    await this.findOne(userId, id);
    // El trigger enforce_single_default_address desmarca las demás.
    const { data, error } = await this.supabase.admin
      .from("addresses")
      .update({ is_default: true })
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  /**
   * Compatibilidad con el frontend existente: upsert sobre la dirección default.
   * Si no hay default, se crea una nueva marcada como default.
   */
  async upsertDefault(
    userId: string,
    dto: CreateAddressDto,
  ): Promise<AddressRow> {
    const current = await this.getDefault(userId);
    if (current) {
      return this.update(userId, current.id, { ...dto, isDefault: true });
    }
    return this.create(userId, { ...dto, isDefault: true });
  }

  private toRowPayload(
    userId: string,
    dto: CreateAddressDto,
  ): Record<string, unknown> {
    return {
      user_id: userId,
      label: dto.label ?? "casa",
      recipient_name: dto.recipientName ?? null,
      line1: dto.line1,
      line2: dto.line2 ?? null,
      neighborhood: dto.neighborhood,
      city: dto.city,
      department: dto.department,
      postal_code: dto.postalCode ?? null,
      country: dto.country || "CO",
      phone: dto.phone,
      notes: dto.notes ?? null,
      is_default: dto.isDefault ?? false,
    };
  }
}
