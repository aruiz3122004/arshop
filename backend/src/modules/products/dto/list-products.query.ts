import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class ListProductsQuery {
  @IsOptional() @IsIn(["hombre", "mujer"]) gender?: "hombre" | "mujer";
  @IsOptional() @IsString() @MaxLength(60) category?: string;
  // Tope a `q`: ilike(name, '%q%') llega directo a Postgres y escanea trgm.
  // 80 chars cubre búsquedas razonables sin exponer el motor a payloads
  // de kilobytes (DoS barato).
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsInt() @Min(0) minPrice?: number;
  @IsOptional() @IsInt() @Min(0) maxPrice?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() @MaxLength(64) cursor?: string;
}
