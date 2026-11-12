import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { CreateAddressDto } from "../src/modules/users/dto/address.dto";

describe("CreateAddressDto", () => {
  const base = {
    line1: "Calle 93 # 11-45",
    neighborhood: "Chicó",
    city: "Bogotá",
    department: "Cundinamarca",
    phone: "+573001234567",
  };

  it("acepta payload mínimo válido", () => {
    const dto = plainToInstance(CreateAddressDto, base);
    expect(validateSync(dto)).toHaveLength(0);
  });

  it("rechaza label fuera del enum", () => {
    const dto = plainToInstance(CreateAddressDto, {
      ...base,
      label: "secundaria",
    } as any);
    const errors = validateSync(dto);
    expect(errors.some((e) => e.property === "label")).toBe(true);
  });

  it("rechaza línea 1 vacía", () => {
    const dto = plainToInstance(CreateAddressDto, {
      ...base,
      line1: "",
    });
    const errors = validateSync(dto);
    expect(errors.some((e) => e.property === "line1")).toBe(true);
  });

  it("rechaza teléfono demasiado corto", () => {
    const dto = plainToInstance(CreateAddressDto, {
      ...base,
      phone: "123",
    });
    const errors = validateSync(dto);
    expect(errors.some((e) => e.property === "phone")).toBe(true);
  });
});
