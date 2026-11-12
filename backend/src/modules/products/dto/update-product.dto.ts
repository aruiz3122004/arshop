import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { CreateVariantDto } from "./create-product.dto";

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

export class UpdateProductDto {
  @IsOptional() @IsString() @MaxLength(80) slug?: string;
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(80) brand?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsIn(GENDERS) gender?: (typeof GENDERS)[number];
  @IsOptional() @IsIn(CATEGORIES) category?: (typeof CATEGORIES)[number];
  @IsOptional() @IsInt() @Min(0) priceCop?: number;
  @IsOptional() @IsInt() @Min(0) compareAtPriceCop?: number | null;
  @IsOptional() @IsIn(FITS) fit?: (typeof FITS)[number] | null;
  @IsOptional() sizeGuide?: Record<string, unknown> | null;
  @IsOptional() @IsArray() @IsString({ each: true }) images?: string[];
  @IsOptional() @IsBoolean() active?: boolean;

  /** Flash drops: ventana de venta. Enviar null para limpiar. */
  @IsOptional() @IsISO8601() dropStartsAt?: string | null;
  @IsOptional() @IsISO8601() dropEndsAt?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[];
}
