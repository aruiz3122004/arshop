import { QrService } from "../src/modules/qr/qr.service";

function makeService() {
  const config = {
    getOrThrow: (k: string) => {
      if (k === "QR_HMAC_SECRET") return "a".repeat(64);
      if (k === "QR_TTL_SECONDS") return 60;
      if (k === "CLIENT_CODE_TTL_SECONDS") return 120;
      throw new Error(`unknown ${k}`);
    },
  } as any;

  const store = new Map<string, string>();
  const redis = {
    setNx: async (k: string, v: string) => {
      if (store.has(k)) return false;
      store.set(k, v);
      return true;
    },
  } as any;

  return new QrService(config, redis);
}

describe("QrService", () => {
  it("issue + verify roundtrip", () => {
    const qr = makeService();
    const { token, jti } = qr.issue("order-123");
    const payload = qr.verify(token);
    expect(payload.orderId).toBe("order-123");
    expect(payload.jti).toBe(jti);
  });

  it("rechaza firma manipulada", () => {
    const qr = makeService();
    const { token } = qr.issue("order-123");
    const parts = token.split(".");
    const tampered = `${parts[0]}.deadbeefxxxx`;
    expect(() => qr.verify(tampered)).toThrow();
  });

  it("rechaza payload modificado", () => {
    const qr = makeService();
    const { token } = qr.issue("order-123");
    const [enc, sig] = token.split(".");
    const payload = JSON.parse(Buffer.from(enc, "base64url").toString("utf8"));
    payload.orderId = "order-attacker";
    const newEnc = Buffer.from(JSON.stringify(payload)).toString("base64url");
    expect(() => qr.verify(`${newEnc}.${sig}`)).toThrow();
  });

  it("consumeJti es single-use", async () => {
    const qr = makeService();
    const { jti } = qr.issue("order-123");
    await expect(qr.consumeJti(jti)).resolves.toBe(true);
    await expect(qr.consumeJti(jti)).rejects.toThrow(/ya fue utilizado/);
  });
});
