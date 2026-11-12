import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateReviewDto {
  /** Línea de pedido que respalda la compra (compra verificada). */
  @IsUUID()
  orderItemId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  body!: string;
}

export class ListReviewsQuery {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}

export class ModerateReviewDto {
  @IsIn(["PENDING", "APPROVED", "REJECTED"])
  status!: "PENDING" | "APPROVED" | "REJECTED";

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class AdminListReviewsQuery {
  @IsOptional()
  @IsIn(["PENDING", "APPROVED", "REJECTED"])
  status?: "PENDING" | "APPROVED" | "REJECTED";

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}
