import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class CreateNumberingRangeDto {
  @IsIn(["FV", "NC", "ND", "POS"]) documentType!: "FV" | "NC" | "ND" | "POS";
  @IsString() @MaxLength(12) prefix!: string;
  @IsOptional() @IsString() @MaxLength(60) resolutionNumber?: string;
  @IsOptional() @IsString() @MaxLength(20) resolutionDate?: string;
  @IsInt() @Min(1) rangeFrom!: number;
  @IsInt() @Min(1) rangeTo!: number;
  @IsOptional() @IsString() @MaxLength(20) validFrom?: string;
  @IsOptional() @IsString() @MaxLength(20) validTo?: string;
  @IsOptional() @IsString() @MaxLength(200) technicalKey?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateNumberingRangeDto {
  @IsOptional() @IsIn(["FV", "NC", "ND", "POS"]) documentType?: "FV" | "NC" | "ND" | "POS";
  @IsOptional() @IsString() @MaxLength(12) prefix?: string;
  @IsOptional() @IsString() @MaxLength(60) resolutionNumber?: string;
  @IsOptional() @IsString() @MaxLength(20) resolutionDate?: string;
  @IsOptional() @IsInt() @Min(1) rangeFrom?: number;
  @IsOptional() @IsInt() @Min(1) rangeTo?: number;
  @IsOptional() @IsString() @MaxLength(20) validFrom?: string;
  @IsOptional() @IsString() @MaxLength(20) validTo?: string;
  @IsOptional() @IsString() @MaxLength(200) technicalKey?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
