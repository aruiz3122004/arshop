import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export const ADDRESS_LABELS = ["casa", "oficina", "otro"] as const;
export type AddressLabel = (typeof ADDRESS_LABELS)[number];

export class CreateAddressDto {
  @IsOptional()
  @IsIn(ADDRESS_LABELS)
  label?: AddressLabel;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  recipientName?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  line1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  line2?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  neighborhood!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  department!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @IsString()
  @MinLength(7)
  @MaxLength(32)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAddressDto {
  @IsOptional()
  @IsIn(ADDRESS_LABELS)
  label?: AddressLabel;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  recipientName?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  line1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  line2?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  neighborhood?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @IsOptional()
  @IsString()
  @MinLength(7)
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
