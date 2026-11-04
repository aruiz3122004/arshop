import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MinLength,
} from "class-validator";

export class CreateDomiciliarioDto {
  // Si se pasa userId: promueve un usuario existente a REPARTIDOR.
  // Si se pasa email+password: crea un auth.user nuevo y le hace promote.
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsString()
  @Length(2, 120)
  nombreCompleto!: string;

  @IsString()
  @Length(2, 60)
  departamento!: string;

  @IsString()
  @Length(2, 60)
  ciudad!: string;

  @IsString()
  @Length(2, 60)
  vehiculo!: string;

  @IsString()
  @Length(3, 20)
  placa!: string;

  @IsString()
  @Length(2, 60)
  ciudadPlaca!: string;

  @IsOptional()
  @IsEnum(["DISPONIBLE", "OCUPADO", "INACTIVO"])
  disponibilidad?: "DISPONIBLE" | "OCUPADO" | "INACTIVO";
}

export class UpdateDomiciliarioDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  nombreCompleto?: string;

  @IsOptional()
  @IsString()
  @Length(2, 60)
  departamento?: string;

  @IsOptional()
  @IsString()
  @Length(2, 60)
  ciudad?: string;

  @IsOptional()
  @IsString()
  @Length(2, 60)
  vehiculo?: string;

  @IsOptional()
  @IsString()
  @Length(3, 20)
  placa?: string;

  @IsOptional()
  @IsString()
  @Length(2, 60)
  ciudadPlaca?: string;

  @IsOptional()
  @IsEnum(["DISPONIBLE", "OCUPADO", "INACTIVO"])
  disponibilidad?: "DISPONIBLE" | "OCUPADO" | "INACTIVO";
}
