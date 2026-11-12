import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class MarkInvoiceIssuedDto {
  /** Número aceptado por la DIAN. Si se omite se conserva el asignado. */
  @IsOptional() @IsInt() @Min(1) number?: number;
  /** CUFE real devuelto por la DIAN. */
  @IsString() @MinLength(1) @MaxLength(200) cufe!: string;
  /** XML aceptado (opcional; reemplaza el paquete generado). */
  @IsOptional() @IsString() xml?: string;
  @IsOptional() @IsString() @MaxLength(500) message?: string;
}

export class CreateCreditNoteDto {
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
  /** Monto parcial. Si se omite se acredita el saldo pendiente. */
  @IsOptional() @IsInt() @Min(1) amountCop?: number;
}
