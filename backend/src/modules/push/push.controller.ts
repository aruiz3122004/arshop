import { Body, Controller, Delete, Get, Post, Req } from "@nestjs/common";
import { PushService } from "./push.service";
import { ConfigService } from "@nestjs/config";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import type { AuthenticatedUser } from "../../common/types/user";

@Controller("push")
export class PushController {
  constructor(
    private readonly push: PushService,
    private readonly config: ConfigService,
  ) {}

  /** El frontend consulta la public key para registrar el SW. */
  @Public()
  @Get("public-key")
  publicKey() {
    return {
      enabled: this.push.isEnabled(),
      publicKey: this.config.get<string>("VAPID_PUBLIC_KEY") ?? null,
    };
  }

  @Post("subscribe")
  subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
    @Body()
    dto: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    },
  ) {
    const ua = req.headers["user-agent"];
    return this.push.subscribe(user.id, dto, ua);
  }

  @Delete("subscribe")
  unsubscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: { endpoint: string },
  ) {
    return this.push.unsubscribe(user.id, dto.endpoint);
  }
}
