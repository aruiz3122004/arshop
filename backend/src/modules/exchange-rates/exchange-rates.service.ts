import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../../redis/redis.service";

export interface ExchangeRates {
  USD: number;
  EUR: number;
}

const FALLBACK: ExchangeRates = { USD: 0.00025, EUR: 0.00023 };
const CACHE_KEY = "exchange:rates:COP";
const TTL_SECONDS = 6 * 60 * 60; // 6 horas

@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);

  constructor(private readonly redis: RedisService) {}

  async getRates(): Promise<ExchangeRates> {
    const cached = await this.redis.getJson<ExchangeRates>(CACHE_KEY);
    if (cached) return cached;

    try {
      const res = await fetch(
        "https://api.frankfurter.app/latest?from=COP&to=USD,EUR",
        { signal: AbortSignal.timeout(5_000) },
      );
      if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`);

      const data = (await res.json()) as { rates: { USD: number; EUR: number } };
      const rates: ExchangeRates = {
        USD: data.rates.USD,
        EUR: data.rates.EUR,
      };

      await this.redis.setJson(CACHE_KEY, rates, TTL_SECONDS);
      this.logger.log(`Rates actualizadas: 1 COP = ${rates.USD} USD | ${rates.EUR} EUR`);
      return rates;
    } catch (err) {
      this.logger.warn(
        `No se pudo obtener tasas de Frankfurter: ${(err as Error).message} — usando fallback`,
      );
      return FALLBACK;
    }
  }
}
