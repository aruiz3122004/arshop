import { Module } from "@nestjs/common";
import { PaymentsController } from "./payments.controller";
import { AdminDisputesController } from "./admin-disputes.controller";
import { PaymentsService } from "./payments.service";
import { RefundService } from "./refund.service";
import { OrdersModule } from "../orders/orders.module";
import { InventoryModule } from "../inventory/inventory.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { ExchangeRatesModule } from "../exchange-rates/exchange-rates.module";
import { InvoicingModule } from "../invoicing/invoicing.module";

@Module({
  imports: [OrdersModule, InventoryModule, NotificationsModule, AuditLogsModule, ExchangeRatesModule, InvoicingModule],
  controllers: [PaymentsController, AdminDisputesController],
  providers: [PaymentsService, RefundService],
  exports: [PaymentsService, RefundService],
})
export class PaymentsModule {}
