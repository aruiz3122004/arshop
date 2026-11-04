import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { OrdersService } from "../orders/orders.service";
import { ResolveDisputeDto, ResolveReturnDto } from "../orders/dto/dispute.dto";
import { RefundService } from "./refund.service";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/user";

@Controller()
export class AdminDisputesController {
  constructor(
    private readonly orders: OrdersService,
    private readonly refunds: RefundService,
  ) {}

  @Roles("ADMIN")
  @Get("admin/orders/disputed")
  list(@Query("resolved") resolved?: string) {
    return this.orders.listDisputes(resolved === "1" || resolved === "true");
  }

  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  @Post("admin/orders/:id/resolve-dispute")
  async resolve(
    @CurrentUser() admin: AuthenticatedUser,
    @Param("id") orderId: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.orders.resolveDispute(
      admin.id,
      orderId,
      dto.decision,
      dto.note,
      (id) => this.refunds.refund(admin.id, id, "dispute"),
    );
  }

  @Roles("ADMIN")
  @Get("admin/orders/returns")
  listReturns(@Query("resolved") resolved?: string) {
    return this.orders.listReturns(resolved === "1" || resolved === "true");
  }

  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  @Post("admin/orders/:id/resolve-return")
  async resolveReturn(
    @CurrentUser() admin: AuthenticatedUser,
    @Param("id") orderId: string,
    @Body() dto: ResolveReturnDto,
  ) {
    return this.orders.resolveReturn(
      admin.id,
      orderId,
      dto.decision,
      dto.note,
      (id) => this.refunds.refund(admin.id, id, "rma_return"),
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post("orders/:id/cancel")
  async cancelOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") orderId: string,
  ) {
    const isAdmin = user.role === "ADMIN";
    return this.orders.cancelOrder(
      user.id,
      isAdmin,
      orderId,
      (id) => this.refunds.refund(user.id, id, isAdmin ? "admin_cancel" : "client_cancel"),
    );
  }
}
