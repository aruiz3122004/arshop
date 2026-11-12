import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { SupabaseService } from "../../supabase/supabase.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { ensureDomiciliarioRow } from "../delivery/delivery-provisioning";
import { AddressesService } from "./addresses.service";
import type { UpdateProfileDto } from "./dto/update-profile.dto";
import type { CreateAddressDto } from "./dto/address.dto";
import type { AuthenticatedUser } from "../../common/types/user";

const PROFILE_SELECT =
  "id, email, full_name, phone, document_type, document_number, role, blocked, created_at";

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly addresses: AddressesService,
    private readonly audit: AuditLogsService,
  ) {}

  async me(user: AuthenticatedUser) {
    // El guard ya trajo el perfil completo en `user.profile` y la address
    // default se consulta en paralelo. En el caso raro de que el guard haya
    // devuelto un perfil stub (created_at epoch 0 → la fila no existe), lo
    // persistimos aquí y seguimos.
    const profileExists = user.profile.created_at !== new Date(0).toISOString();

    const [maybeCreated, shippingAddress] = await Promise.all([
      profileExists
        ? Promise.resolve(user.profile)
        : this.ensureProfileExists(user),
      this.addresses.getDefault(user.id),
    ]);

    const profile = maybeCreated;

    // Si el email del token no coincide con el guardado, re-sincronizamos
    // en background (no bloquea la respuesta).
    if (profile.email !== user.email && user.email) {
      this.supabase.admin
        .from("profiles")
        .update({ email: user.email })
        .eq("id", user.id)
        .then(({ error }) => {
          if (error) {
            // best-effort: log por consola, no fallamos la request
            console.warn(`profile email sync falló: ${error.message}`);
          }
        });
      profile.email = user.email;
    }

    return {
      ...profile,
      email: profile.email ?? user.email,
      shippingAddress: shippingAddress
        ? this.toApiAddress(shippingAddress)
        : null,
    };
  }

  private async ensureProfileExists(user: AuthenticatedUser) {
    const { data, error } = await this.supabase.admin
      .from("profiles")
      .upsert({
        id: user.id,
        email: user.email,
        full_name: user.email ? user.email.split("@")[0] : "Cliente",
        role: "CUSTOMER",
        blocked: false,
      })
      .select(PROFILE_SELECT)
      .single();
    if (error) throw error;
    return data;
  }

  async getShippingAddress(userId: string) {
    const row = await this.addresses.getDefault(userId);
    return row ? this.toApiAddress(row) : null;
  }

  async saveShippingAddress(userId: string, dto: CreateAddressDto) {
    const row = await this.addresses.upsertDefault(userId, dto);
    return { ok: true, shippingAddress: this.toApiAddress(row) };
  }

  async updateMe(user: AuthenticatedUser, dto: UpdateProfileDto) {
    // Nunca aceptamos role/blocked desde el cliente: esos campos sólo se
    // mueven desde el panel admin, nunca desde el perfil propio.
    const patch: Record<string, unknown> = {};
    if (dto.fullName !== undefined) patch.full_name = dto.fullName;
    if (dto.phone !== undefined) patch.phone = dto.phone;
    if (dto.documentType !== undefined) patch.document_type = dto.documentType;
    if (dto.documentNumber !== undefined)
      patch.document_number = dto.documentNumber;

    const { data, error } = await this.supabase.admin
      .from("profiles")
      .update(patch)
      .eq("id", user.id)
      .select(PROFILE_SELECT)
      .single();
    if (error) throw error;
    return data;
  }

  async listAll(
    limit = 50,
    cursor?: string,
    filters?: { search?: string; role?: string },
  ) {
    let q = this.supabase.admin
      .from("profiles")
      .select("id, email, full_name, role, blocked, created_at")
      .order("created_at", { ascending: false });

    if (filters?.search) {
      const s = `%${filters.search}%`;
      q = q.or(`email.ilike.${s},full_name.ilike.${s}`);
    }

    if (filters?.role) {
      q = q.eq("role", filters.role);
    }

    q = q.limit(limit + 1); // +1 para detectar si hay más
    if (cursor) q = q.lt("created_at", cursor);

    const { data, error } = await q;
    if (error) throw error;

    const hasMore = data && data.length > limit;
    const rows = hasMore ? data.slice(0, -1) : data || [];
    const nextCursor = rows.length > 0 ? rows[rows.length - 1].created_at : null;

    return { rows, nextCursor, hasMore };
  }

  async createUser(
    email: string,
    fullName?: string,
    role: "CUSTOMER" | "ADMIN" | "REPARTIDOR" = "CUSTOMER",
    password?: string,
  ) {
    const normalized = email.toLowerCase().trim();

    if (!password) {
      password = this.generateRandomPassword();
    }

    const { data, error } = await this.supabase.admin.auth.admin.createUser({
      email: normalized,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName ?? null },
    });

    if (error) throw new BadRequestException(error.message);

    if (!data.user) {
      throw new BadRequestException("No se pudo crear el usuario.");
    }

    await this.supabase.admin
      .from("profiles")
      .upsert({
        id: data.user.id,
        email: normalized,
        full_name: fullName ?? null,
        role,
        blocked: false,
      });

    // Mismo invariante que en updateUser: rol REPARTIDOR ⇒ ficha operativa.
    if (role === "REPARTIDOR") {
      await ensureDomiciliarioRow(this.supabase.admin, data.user.id).catch(
        (err) =>
          this.logger.warn(
            `createUser: no se pudo crear domiciliario para ${data.user?.id}: ${(err as Error).message}`,
          ),
      );
    }

    return {
      id: data.user.id,
      email: data.user.email,
      fullName,
      role,
    };
  }

  async updateUser(
    id: string,
    patch: {
      fullName?: string;
      phone?: string;
      documentType?: string;
      documentNumber?: string;
      role?: "CUSTOMER" | "ADMIN" | "REPARTIDOR";
      blocked?: boolean;
      password?: string;
    },
  ) {
    // Hardening: no puedes bloquear el último admin
    if (patch.blocked === true && patch.role === undefined) {
      const { data: current } = await this.supabase.admin
        .from("profiles")
        .select("role")
        .eq("id", id)
        .single();

      if (current?.role === "ADMIN") {
        const { data: adminCount } = await this.supabase.admin
          .from("profiles")
          .select("id")
          .eq("role", "ADMIN")
          .eq("blocked", false);

        if (adminCount && adminCount.length <= 1) {
          throw new ForbiddenException(
            "No se puede bloquear: al menos un admin debe permanecer activo.",
          );
        }
      }
    }

    // Actualizar auth (password)
    if (patch.password) {
      const { error: pwErr } = await this.supabase.admin.auth.admin.updateUserById(id, {
        password: patch.password,
      });
      if (pwErr) throw new BadRequestException(pwErr.message);
    }

    // Actualizar profile
    const profilePatch: Record<string, unknown> = {};
    if (patch.fullName !== undefined) profilePatch.full_name = patch.fullName;
    if (patch.phone !== undefined) profilePatch.phone = patch.phone;
    if (patch.documentType !== undefined) profilePatch.document_type = patch.documentType;
    if (patch.documentNumber !== undefined) profilePatch.document_number = patch.documentNumber;
    if (patch.role !== undefined) profilePatch.role = patch.role;
    if (patch.blocked !== undefined) profilePatch.blocked = patch.blocked;

    const { data, error } = await this.supabase.admin
      .from("profiles")
      .update(profilePatch)
      .eq("id", id)
      .select(
        "id, email, full_name, phone, document_type, document_number, role, blocked, created_at",
      )
      .single();

    if (error) throw new BadRequestException(error.message);

    // Invariante: rol REPARTIDOR ⇒ ficha en domiciliarios. Así el cambio de
    // rol desde el panel admin (o por PATCH /users/:id) no deja al usuario con
    // el botón visible y un 404 en /delivery/*.
    if (data.role === "REPARTIDOR") {
      await ensureDomiciliarioRow(this.supabase.admin, id).catch((err) =>
        this.logger.warn(
          `updateUser: no se pudo asegurar domiciliario para ${id}: ${(err as Error).message}`,
        ),
      );
    }

    return data;
  }

  async deleteUser(id: string) {
    // Hardening: verificar que no sea el único admin
    const { data: user } = await this.supabase.admin
      .from("profiles")
      .select("role")
      .eq("id", id)
      .single();

    if (user?.role === "ADMIN") {
      const { data: adminCount } = await this.supabase.admin
        .from("profiles")
        .select("id")
        .eq("role", "ADMIN")
        .eq("blocked", false);

      if (adminCount && adminCount.length <= 1) {
        throw new ForbiddenException(
          "No se puede eliminar: al menos un admin debe permanecer activo.",
        );
      }
    }

    const { error } = await this.supabase.admin.auth.admin.deleteUser(id);
    if (error) throw new BadRequestException(error.message);

    return { ok: true };
  }

  async bulkImportUsers(
    users: Array<{ email: string; fullName?: string; role?: "CUSTOMER" | "ADMIN" | "REPARTIDOR" }>,
  ) {
    const created: Array<{ id: string; email: string }> = [];
    const failed: Array<{ email: string; reason: string }> = [];

    for (const user of users) {
      try {
        const email = user.email.toLowerCase().trim();

        if (!email || !email.includes("@")) {
          failed.push({ email, reason: "Email inválido" });
          continue;
        }

        const password = this.generateRandomPassword();
        const { data, error } = await this.supabase.admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: user.fullName ?? null },
        });

        if (error) {
          failed.push({ email, reason: error.message });
          continue;
        }

        if (!data.user) {
          failed.push({ email, reason: "No se pudo crear el usuario" });
          continue;
        }

        await this.supabase.admin
          .from("profiles")
          .upsert({
            id: data.user.id,
            email,
            full_name: user.fullName ?? null,
            role: user.role ?? "CUSTOMER",
            blocked: false,
          });

        created.push({ id: data.user.id, email });
      } catch (err: any) {
        failed.push({ email: user.email, reason: err.message || "Error desconocido" });
      }
    }

    return {
      created,
      failed,
      summary: {
        total: users.length,
        successful: created.length,
        failed: failed.length,
      },
    };
  }

  private generateRandomPassword(): string {
    return require("crypto").randomBytes(16).toString("base64url");
  }

  async setBlocked(id: string, blocked: boolean) {
    const { data, error } = await this.supabase.admin
      .from("profiles")
      .update({ blocked })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Forma plana que espera el frontend (campos en camelCase derivados). */
  private toApiAddress(row: {
    id: string;
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
  }) {
    return {
      id: row.id,
      label: row.label,
      recipientName: row.recipient_name ?? undefined,
      line1: row.line1,
      line2: row.line2 ?? undefined,
      neighborhood: row.neighborhood,
      city: row.city,
      department: row.department,
      postalCode: row.postal_code ?? undefined,
      country: row.country,
      phone: row.phone,
      notes: row.notes ?? undefined,
      isDefault: row.is_default,
    };
  }
}
