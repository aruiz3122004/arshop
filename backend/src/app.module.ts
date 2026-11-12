import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule } from "@nestjs/throttler";
import { BullModule } from "@nestjs/bullmq";
import { validate } from "./config/env.validation";
import { SupabaseModule } from "./supabase/supabase.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { ProductsModule } from "./modules/products/products.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { AuditLogsModule } from "./modules/audit-logs/audit-logs.module";
import { HealthModule } from "./modules/health/health.module";
import { UploadsModule } from "./modules/uploads/uploads.module";
import { ExchangeRatesModule } from "./modules/exchange-rates/exchange-rates.module";
import { SearchModule } from "./modules/search/search.module";
import { DeliveryModule } from "./modules/delivery/delivery.module";
import { InvoicingModule } from "./modules/invoicing/invoicing.module";
import { ReviewsModule } from "./modules/reviews/reviews.module";
import { GuestModule } from "./modules/guest/guest.module";
import { QrModule } from "./modules/qr/qr.module";
import { PushModule } from "./modules/push/push.module";
import { RedisModule } from "./redis/redis.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [".env.local", ".env"],
      validate,
    }),

    ScheduleModule.forRoot(),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => [
        {
          ttl: cfg.getOrThrow<number>("THROTTLE_TTL_SECONDS") * 1000,
          limit: cfg.getOrThrow<number>("THROTTLE_LIMIT_DEFAULT"),
        },
      ],
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        connection: {
          host: cfg.getOrThrow<string>("REDIS_HOST").replace(/^https?:\/\//i, "").replace(/^rediss?:\/\//i, "").replace(/\/+$/, "").trim(),
          port: cfg.getOrThrow<number>("REDIS_PORT"),
          password: cfg.get<string>("REDIS_PASSWORD") || undefined,
          tls: cfg.get<boolean>("REDIS_TLS") ? {} : undefined,
          connectTimeout: 2000,
          enableReadyCheck: false,
          // BullMQ necesita la cola offline activa: si Redis tarda en estar
          // disponible (arranque en Render, reinicios, red), sus comandos
          // deben esperar en vez de lanzar
          // "Stream isn't writeable and enableOfflineQueue options is false".
          retryStrategy: (times: number) => Math.min(times * 2000, 15000),
        },
      }),
    }),

    RedisModule,
    SupabaseModule,
    GuestModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    InventoryModule,
    OrdersModule,
    PaymentsModule,
    NotificationsModule,
    AuditLogsModule,
    UploadsModule,
    ExchangeRatesModule,
    SearchModule,
    QrModule,
    PushModule,
    DeliveryModule,
    InvoicingModule,
    ReviewsModule,
  ],
})
export class AppModule {}
