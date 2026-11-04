import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Param,
  Post,
} from "@nestjs/common";
import { InventoryService } from "./inventory.service";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/user";

@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  /**
   * Suscripción al aviso de reposición para una variante agotada.
   * Idempotente: si ya existe una suscripción activa, no hace nada.
   */
  @Post("notify-me")
  async notifyMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body("variantId") variantId: string,
  ) {
    if (!variantId || typeof variantId !== "string") {
      throw new BadRequestException("variantId required");
    }
    await this.inventory.subscribeNotification(user.id, variantId);
    return { ok: true };
  }

  @Delete("notify-me/:variantId")
  async cancelNotify(
    @CurrentUser() user: AuthenticatedUser,
    @Param("variantId") variantId: string,
  ) {
    await this.inventory.unsubscribeNotification(user.id, variantId);
    return { ok: true };
  }
}
