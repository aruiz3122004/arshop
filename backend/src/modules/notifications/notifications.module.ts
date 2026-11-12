import { Module, OnModuleInit } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import {
  NotificationsService,
  EMAIL_QUEUE,
  DELIVERY_DAY_QUEUE,
} from "./notifications.service";
import { EmailProcessor } from "./processors/email.processor";
import { DeliveryDayProcessor } from "./processors/delivery-day.processor";
import { PushModule } from "../push/push.module";

@Module({
  imports: [
    BullModule.registerQueue(
      { name: EMAIL_QUEUE },
      { name: DELIVERY_DAY_QUEUE },
    ),
    PushModule,
  ],
  providers: [NotificationsService, EmailProcessor, DeliveryDayProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule implements OnModuleInit {
  constructor(private readonly notifications: NotificationsService) {}

  async onModuleInit() {
    if (process.env.NODE_ENV !== "production") {
      return;
    }
    // Registra el cron diario para notificar entregas al abrir el día.
    try {
      await this.notifications.ensureDailyScan();
    } catch (e) {
      // No bloquear el arranque si Redis todavía no está disponible.
      console.warn("ensureDailyScan error:", (e as Error).message);
    }
  }
}
