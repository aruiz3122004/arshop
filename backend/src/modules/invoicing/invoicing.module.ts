import { Module } from "@nestjs/common";
import { InvoicingController } from "./invoicing.controller";
import { InvoicingService } from "./invoicing.service";
import { InvoiceNumberingService } from "./invoice-numbering.service";
import { InvoiceRepresentationService } from "./invoice-representation.service";
import {
  DianFreeProvider,
  DianOwnProvider,
  FactusProvider,
  SimulatedDianProvider,
} from "./providers/dian.providers";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [AuditLogsModule, NotificationsModule],
  controllers: [InvoicingController],
  providers: [
    InvoicingService,
    InvoiceNumberingService,
    InvoiceRepresentationService,
    SimulatedDianProvider,
    DianFreeProvider,
    DianOwnProvider,
    FactusProvider,
  ],
  exports: [InvoicingService, InvoiceNumberingService],
})
export class InvoicingModule {}
