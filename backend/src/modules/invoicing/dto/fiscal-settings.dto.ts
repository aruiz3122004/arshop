import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class UpdateFiscalSettingsDto {
  @IsOptional() @IsString() @MaxLength(200) legalName?: string;
  @IsOptional() @IsString() @MaxLength(160) tradeName?: string;
  @IsOptional() @IsString() @MaxLength(20) nit?: string;
  @IsOptional() @IsString() @MaxLength(2) dv?: string;
  @IsOptional() @IsString() @MaxLength(80) taxRegime?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) fiscalResponsibilities?: string[];
  @IsOptional() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @IsString() @MaxLength(10) municipalityCode?: string;
  @IsOptional() @IsString() @MaxLength(100) municipality?: string;
  @IsOptional() @IsString() @MaxLength(100) department?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) logoUrl?: string;
  @IsOptional()
  @IsIn(["DIAN_SIMULATED", "DIAN_FREE", "DIAN_OWN", "FACTUS"])
  invoiceProvider?: "DIAN_SIMULATED" | "DIAN_FREE" | "DIAN_OWN" | "FACTUS";
  @IsOptional() @IsIn(["HABILITACION", "PRODUCCION"]) environment?: "HABILITACION" | "PRODUCCION";
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() demoMode?: boolean;
  @IsOptional() @IsString() @MaxLength(120) softwareId?: string;
}
