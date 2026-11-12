import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthMailerService } from "./auth-mailer.service";
import { AuthMfaController } from "./auth-mfa.controller";
import { AuthMfaService } from "./auth-mfa.service";
import { RedisModule } from "../../redis/redis.module";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [RedisModule, AuditLogsModule, NotificationsModule],
  controllers: [AuthController, AuthMfaController],
  providers: [AuthService, AuthMailerService, AuthMfaService],
  exports: [AuthService, AuthMfaService],
})
export class AuthModule {}
