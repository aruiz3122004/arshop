import { IsBoolean, IsEnum, IsOptional, IsString, Length, Matches, MaxLength, MinLength, ValidateIf } from "class-validator";

export class ScanQrDto {
  @IsString()
  // El token firmado del QR mide cientos de caracteres. Un valor corto es casi
  // siempre el código de 4 dígitos que el cliente dictó por teléfono, que va
  // por `/delivery/verify-code`; el mensaje lo dice para no dejar al repartidor
  // con un "must be longer than..." en inglés.
  @MinLength(10, {
    message:
      "Eso no es un QR válido. Si el cliente te dictó un código de 4 dígitos, escríbelo en el campo de código.",
  })
  @MaxLength(1024)
  token!: string;

  // Si el cliente diligenció previamente los datos del receptor, pueden
  // llegar null — el service los toma de orders.receiver_prefilled.
  // Si el repartidor los diligencia manualmente, llegan completos.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  receiverName?: string;

  @IsOptional()
  @IsEnum(["CC", "CE", "PP", "NIT"])
  documentType?: "CC" | "CE" | "PP" | "NIT";

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  documentNumber?: string;
}

export class SetPinDto {
  @Matches(/^\d{4}$/, { message: "PIN debe ser 4 dígitos" })
  pin!: string;

  @IsOptional()
  @Matches(/^\d{4}$/)
  currentPin?: string;
}

export class VerifyClientCodeDto {
  @Matches(/^\d{4}$/, { message: "El código debe tener 4 dígitos" })
  code!: string;
}

export class ConfirmDeliveryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  receiverName!: string;

  @IsEnum(["CC", "CE", "PP", "NIT"])
  documentType!: "CC" | "CE" | "PP" | "NIT";

  @IsString()
  @MinLength(4)
  @MaxLength(32)
  documentNumber!: string;

  @IsOptional()
  @IsEnum(["qr", "manual", "cliente"])
  source?: "qr" | "manual" | "cliente";
}

export class SimulateDeliveryDto {
  /**
   * PIN del repartidor (4 dígitos). Opcional sólo si llega `skipPin: true`:
   * el repartidor puede declarar que no lo tiene a mano y simular la entrega
   * únicamente con los datos del receptor. Ambos caminos dejan el pedido en
   * `PENDING_CLIENT` y el cliente debe aceptarlo en 48 h.
   */
  @ValidateIf((o) => !o.skipPin)
  @Matches(/^\d{4}$/, { message: "PIN debe ser 4 dígitos" })
  pin?: string;

  @IsOptional()
  @IsBoolean()
  skipPin?: boolean;

  // Campos opcionales: si vienen vacíos el service autorellena desde profiles.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  receiverName?: string;

  @IsOptional()
  @IsEnum(["CC", "CE", "PP", "NIT"])
  documentType?: "CC" | "CE" | "PP" | "NIT";

  @IsOptional()
  @IsString()
  @MaxLength(32)
  documentNumber?: string;
}

export class UpdateDeliveryProfileDto {
  @IsOptional()
  @IsString()
  @Length(2, 80)
  nombreCompleto?: string;

  /** Departamento/ciudad de operación: definen a qué pedidos se le asigna. */
  @IsOptional()
  @IsString()
  @Length(2, 80)
  departamento?: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  ciudad?: string;

  @IsOptional()
  @IsString()
  vehiculo?: string;

  @IsOptional()
  @IsString()
  placa?: string;

  @IsOptional()
  @IsString()
  ciudadPlaca?: string;

  @IsOptional()
  @IsEnum(["DISPONIBLE", "OCUPADO", "INACTIVO"])
  disponibilidad?: "DISPONIBLE" | "OCUPADO" | "INACTIVO";
}
