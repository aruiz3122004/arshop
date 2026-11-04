import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { DeliveryService } from "./delivery.service";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/user";
import {
  CreateDomiciliarioDto,
  UpdateDomiciliarioDto,
} from "./dto/admin-delivery.dto";

@Roles("ADMIN")
@Controller("admin/deliveries")
export class AdminDeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get()
  list() {
    return this.delivery.adminList();
  }

  @Post()
  create(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: CreateDomiciliarioDto,
  ) {
    return this.delivery.adminCreate(admin.id, dto);
  }

  @Patch(":id")
  update(
    @CurrentUser() admin: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateDomiciliarioDto,
  ) {
    return this.delivery.adminUpdate(admin.id, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() admin: AuthenticatedUser, @Param("id") id: string) {
    return this.delivery.adminDelete(admin.id, id);
  }
}
