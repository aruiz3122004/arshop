import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { AddressesService } from "./addresses.service";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { CreateAddressDto, UpdateAddressDto } from "./dto/address.dto";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import type { AuthenticatedUser } from "../../common/types/user";

@Controller("users")
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly addresses: AddressesService,
    private readonly audit: AuditLogsService,
  ) {}

  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.users.me(user);
  }

  @Patch("me")
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.users.updateMe(user, dto);
  }

  // ───── Dirección predeterminada (compat con el frontend actual) ─────

  @Get("me/shipping-address")
  getShippingAddress(@CurrentUser() user: AuthenticatedUser) {
    return this.users.getShippingAddress(user.id);
  }

  @Put("me/shipping-address")
  saveShippingAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAddressDto,
  ) {
    return this.users.saveShippingAddress(user.id, dto);
  }

  // ───── CRUD completo de direcciones ─────

  @Get("me/addresses")
  listAddresses(@CurrentUser() user: AuthenticatedUser) {
    return this.addresses.list(user.id);
  }

  @Post("me/addresses")
  createAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAddressDto,
  ) {
    return this.addresses.create(user.id, dto);
  }

  @Patch("me/addresses/:id")
  updateAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addresses.update(user.id, id, dto);
  }

  @Delete("me/addresses/:id")
  deleteAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.addresses.remove(user.id, id);
  }

  @Patch("me/addresses/:id/default")
  setDefaultAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.addresses.setDefault(user.id, id);
  }

  // ───── Admin ─────

  @Roles("ADMIN")
  @Get()
  list(
    @Query("limit") limit = 50,
    @Query("cursor") cursor?: string,
    @Query("search") search?: string,
    @Query("role") role?: string,
  ) {
    return this.users.listAll(Number(limit), cursor, { search, role });
  }

  @Roles("ADMIN")
  @Post()
  async create(
    @CurrentUser() admin: AuthenticatedUser,
    @Body("email") email: string,
    @Body("fullName") fullName?: string,
    @Body("role") role?: "CUSTOMER" | "ADMIN" | "REPARTIDOR",
    @Body("password") password?: string,
  ) {
    const result = await this.users.createUser(email, fullName, role, password);
    await this.audit.record(admin.id, "USER_CREATE", result.id, { email });
    return result;
  }

  @Roles("ADMIN")
  @Patch(":id")
  async update(
    @CurrentUser() admin: AuthenticatedUser,
    @Param("id") id: string,
    @Body() patch: any,
  ) {
    const result = await this.users.updateUser(id, patch);
    await this.audit.record(admin.id, "USER_UPDATE", id, patch);
    return result;
  }

  @Roles("ADMIN")
  @Delete(":id")
  async delete(
    @CurrentUser() admin: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    const result = await this.users.deleteUser(id);
    await this.audit.record(admin.id, "USER_DELETE", id, {});
    return result;
  }

  @Roles("ADMIN")
  @Post("bulk")
  async bulkImport(
    @CurrentUser() admin: AuthenticatedUser,
    @Body("users") users: Array<{ email: string; fullName?: string; role?: "CUSTOMER" | "ADMIN" | "REPARTIDOR" }>,
  ) {
    const result = await this.users.bulkImportUsers(users as any);
    await this.audit.record(admin.id, "BULK_USER_IMPORT", "bulk", {
      total: result.summary.total,
      successful: result.summary.successful,
      failed: result.summary.failed,
    });
    return result;
  }

  @Roles("ADMIN")
  @Patch(":id/block")
  async block(
    @CurrentUser() admin: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    const result = await this.users.setBlocked(id, true);
    await this.audit.record(admin.id, "USER_BLOCK", id, {});
    return result;
  }

  @Roles("ADMIN")
  @Patch(":id/unblock")
  async unblock(
    @CurrentUser() admin: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    const result = await this.users.setBlocked(id, false);
    await this.audit.record(admin.id, "USER_UNBLOCK", id, {});
    return result;
  }
}
