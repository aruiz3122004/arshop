import {
  ArrayMinSize,
  Equals,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class OrderItemDto {
  @IsUUID() variantId!: string;
  @IsInt() @Min(1) quantity!: number;
}

export class ShippingAddressDto {
  @IsString() @IsNotEmpty() @MaxLength(160) line1!: string;
  @IsOptional() @IsString() @MaxLength(160) line2?: string;
  @IsString() @IsNotEmpty() @MaxLength(80) neighborhood!: string;
  @IsString() @IsNotEmpty() @MaxLength(80) city!: string;
  @IsString() @IsNotEmpty() @MaxLength(80) department!: string;
  @IsString() @IsNotEmpty() @MaxLength(40) phone!: string;
  @IsOptional() @IsString() @MaxLength(400) notes?: string;
}

export class BillingInfoDto {
  @IsIn(["CC", "CE", "PP", "NIT"]) documentType!: "CC" | "CE" | "PP" | "NIT";
  @IsString() @IsNotEmpty() @MaxLength(30) documentNumber!: string;
  @IsString() @IsNotEmpty() @MaxLength(160) legalName!: string;
  @IsOptional() @IsEmail() @MaxLength(160) email?: string;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress!: ShippingAddressDto;

  /**
   * Datos fiscales del adquiriente para la factura electrónica. Se guardan
   * como snapshot en `orders.billing_*` para que un cambio posterior del
   * perfil no altere una factura ya emitida.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => BillingInfoDto)
  billing?: BillingInfoDto;

  /**
   * Checkbox obligatorio de aceptación de la Política de Tratamiento de Datos
   * (Habeas Data / GDPR). Debe ser estrictamente `true`.
   */
  @Equals(true, {
    message: "Debes aceptar la Política de Tratamiento de Datos Personales.",
  })
  habeasDataAccepted!: true;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  couponCode?: string;
}
