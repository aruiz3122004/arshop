import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class DisputeReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ReceiverDataDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombreReceptor!: string;

  @IsEnum(["CC", "CE", "PP", "NIT"])
  tipoDocumento!: "CC" | "CE" | "PP" | "NIT";

  @Matches(/^\d{4,32}$/, { message: "numeroDocumento debe ser numérico (4-32 dígitos)" })
  numeroDocumento!: string;
}

export class ResolveDisputeDto {
  @IsEnum(["REFUND", "ACCEPT_DELIVERY"])
  decision!: "REFUND" | "ACCEPT_DELIVERY";

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ShipOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  carrier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  trackingNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  trackingUrl?: string;
}

export class ValidateCouponDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  code!: string;

  @IsInt()
  @Min(0)
  subtotalCop!: number;
}

export class CreateReturnDto {
  @IsEnum(["RETRACT_REFUND", "SIZE_EXCHANGE", "DEFECTIVE"])
  type!: "RETRACT_REFUND" | "SIZE_EXCHANGE" | "DEFECTIVE";

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  requestedSize?: string;
}

export class ResolveReturnDto {
  @IsEnum(["APPROVE_REFUND", "APPROVE_EXCHANGE", "REJECT"])
  decision!: "APPROVE_REFUND" | "APPROVE_EXCHANGE" | "REJECT";

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
