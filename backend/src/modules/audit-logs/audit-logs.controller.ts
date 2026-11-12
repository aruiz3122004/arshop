import { Controller, Get, Query } from "@nestjs/common";
import { AuditLogsService } from "./audit-logs.service";
import { Roles } from "../../common/decorators/roles.decorator";

@Controller("audit-logs")
export class AuditLogsController {
  constructor(private readonly audit: AuditLogsService) {}

  @Roles("ADMIN")
  @Get()
  list(@Query("limit") limit = 100, @Query("cursor") cursor?: string, @Query("action") action?: string) {
    return this.audit.list(Number(limit), cursor, action);
  }
}
