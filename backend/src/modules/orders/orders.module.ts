import { Module } from "@nestjs/common";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { QrModule } from "../qr/qr.module";
import { InventoryModule } from "../inventory/inventory.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PushModule } from "../push/push.module";
import { InvoicingModule } from "../invoicing/invoicing.module";

@Module({
  imports: [
    AuditLogsModule,
    QrModule,
    InventoryModule,
    NotificationsModule,
    PushModule,
    InvoicingModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
