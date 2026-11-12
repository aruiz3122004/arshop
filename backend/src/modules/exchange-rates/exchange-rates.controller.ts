import { Controller, Get } from "@nestjs/common";
import { ExchangeRatesService } from "./exchange-rates.service";
import { Public } from "../../common/decorators/public.decorator";

@Public()
@Controller("exchange-rates")
export class ExchangeRatesController {
  constructor(private readonly service: ExchangeRatesService) {}

  @Get()
  getRates() {
    return this.service.getRates();
  }
}
