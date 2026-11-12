import { Module } from "@nestjs/common";
import { ExchangeRatesController } from "./exchange-rates.controller";
import { ExchangeRatesService } from "./exchange-rates.service";
import { RedisModule } from "../../redis/redis.module";

@Module({
  imports: [RedisModule],
  controllers: [ExchangeRatesController],
  providers: [ExchangeRatesService],
  exports: [ExchangeRatesService],
})
export class ExchangeRatesModule {}
