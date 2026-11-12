import { Module } from "@nestjs/common";
import { DeliveryController } from "./delivery.controller";
import { AdminDeliveryController } from "./admin-delivery.controller";
import { DeliveryService } from "./delivery.service";
import { DeliveryConfirmationService } from "./delivery-confirmation.service";
import { QrModule } from "../qr/qr.module";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { PushModule } from "../push/push.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [QrModule, AuditLogsModule, PushModule, NotificationsModule],
  controllers: [DeliveryController, AdminDeliveryController],
  // DeliveryConfirmationService: barrido de la ventana de 24/48 h de las
  // entregas simuladas (recordatorio + escalado a disputa).
  providers: [DeliveryService, DeliveryConfirmationService],
  exports: [DeliveryService],
})
export class DeliveryModule {}
