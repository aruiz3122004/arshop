import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { SetPinDto, SimulateDeliveryDto } from "../src/modules/delivery/dto/scan-qr.dto";

describe("SetPinDto", () => {
  it("rechaza PIN que no sea 4 dígitos", async () => {
    const bad = plainToInstance(SetPinDto, { pin: "12a4" });
    const errors = await validate(bad);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("acepta PIN válido", async () => {
    const good = plainToInstance(SetPinDto, { pin: "4231" });
    const errors = await validate(good);
    expect(errors).toHaveLength(0);
  });
});

describe("SimulateDeliveryDto", () => {
  it("exige el PIN (único campo obligatorio: receptor se autorellena desde profile)", async () => {
    const bad = plainToInstance(SimulateDeliveryDto, {});
    const errors = await validate(bad);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("acepta sólo el PIN (los datos del receptor son opcionales)", async () => {
    const minimal = plainToInstance(SimulateDeliveryDto, { pin: "1234" });
    const errors = await validate(minimal);
    expect(errors).toHaveLength(0);
  });

  it("acepta payload completo", async () => {
    const good = plainToInstance(SimulateDeliveryDto, {
      pin: "1234",
      receiverName: "Patricia Hernández",
      documentType: "CC",
      documentNumber: "72561891",
    });
    const errors = await validate(good);
    expect(errors).toHaveLength(0);
  });

  it("rechaza documentType inválido", async () => {
    const bad = plainToInstance(SimulateDeliveryDto, {
      pin: "1234",
      documentType: "INVALID",
    });
    const errors = await validate(bad);
    expect(errors.length).toBeGreaterThan(0);
  });
});
