import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export const DOCUMENT_TYPES = ["CC", "CE", "PP", "NIT"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsIn(DOCUMENT_TYPES)
  documentType?: DocumentType;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(32)
  documentNumber?: string;
}
