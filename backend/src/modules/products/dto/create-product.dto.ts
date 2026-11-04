import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateVariantDto {
  /** Solo en edición: id de la variante existente para emparejarla. */
  @IsOptional() @IsUUID() id?: string;
  @IsString() @MaxLength(16) size!: string;
  @IsString() @MaxLength(32) colorName!: string;
  @IsString() @MaxLength(16) colorHex!: string;
  @IsString() @MaxLength(64) sku!: string;
  @IsInt() @Min(0) stock!: number;
}

const GENDERS = ["hombre", "mujer"] as const;
const CATEGORIES = [
  "camisas",
  "camisetas",
  "tops",
  "ropa-interior",
  "calzado",
  "pantalones",
] as const;

const FITS = ["slim", "regular", "relaxed", "oversize"] as const;

export class CreateProductDto {
  @IsString() @MaxLength(80) slug!: string;
  @IsString() @MaxLength(160) name!: string;
  @IsString() @MaxLength(80) brand!: string;
  @IsString() @MaxLength(2000) description!: string;
  @IsIn(GENDERS) gender!: (typeof GENDERS)[number];
  @IsIn(CATEGORIES) category!: (typeof CATEGORIES)[number];
  @IsInt() @Min(0) priceCop!: number;
  @IsOptional() @IsInt() @Min(0) compareAtPriceCop?: number | null;
  @IsOptional() @IsIn(FITS) fit?: (typeof FITS)[number] | null;
  @IsOptional() sizeGuide?: Record<string, unknown> | null;
  @IsArray() @IsString({ each: true }) images!: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => CreateVariantDto)
  variants!: CreateVariantDto[];

  @IsOptional() @IsBoolean() active?: boolean;

  /** Flash drops: ventana de venta. Null = disponible siempre. */
  @IsOptional() @IsISO8601() dropStartsAt?: string;
  @IsOptional() @IsISO8601() dropEndsAt?: string;
}
