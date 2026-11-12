import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../../supabase/supabase.service";

const BUCKET = "product-images";
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Devuelve una URL firmada con la que el admin puede subir el archivo
   * directamente a Supabase Storage sin exponer la service_role key.
   */
  async signProductImage(filename: string, contentType: string) {
    if (!filename || !contentType) {
      throw new BadRequestException("filename y contentType son obligatorios.");
    }
    if (!ALLOWED_TYPES.includes(contentType)) {
      throw new BadRequestException(
        `Formato no permitido. Usa: ${ALLOWED_TYPES.join(", ")}`,
      );
    }

    const safeName = filename
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);

    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

    const { data, error } = await this.supabase.admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (error) {
      this.logger.error(
        `createSignedUploadUrl falló (¿bucket "${BUCKET}" creado?): ${error.message}`,
      );
      throw new BadRequestException(
        `No se pudo firmar la subida. Asegúrate de que el bucket "${BUCKET}" existe y es público.`,
      );
    }

    const pub = this.supabase.admin.storage.from(BUCKET).getPublicUrl(data.path);

    return {
      signedUrl: data.signedUrl,
      token: data.token,
      path: data.path,
      publicUrl: pub.data.publicUrl,
      maxSizeBytes: MAX_SIZE_BYTES,
      allowedTypes: ALLOWED_TYPES,
    };
  }
}
