import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { SignUpDto } from "./dto/sign-up.dto";
import { SignInDto } from "./dto/sign-in.dto";
import { Public } from "../../common/decorators/public.decorator";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "./auth-cookies";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post("sign-up")
  signUp(@Body() dto: SignUpDto) {
    return this.auth.signUp(dto);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @Post("sign-in")
  async signIn(
    @Body() dto: SignInDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip || req.socket.remoteAddress || undefined;
    const userAgent = req.get("user-agent") || undefined;
    const result = await this.auth.signIn(dto, ip, userAgent);
    if (result.accessToken && result.refreshToken) {
      setAuthCookies(res, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
    }
    return result;
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @HttpCode(HttpStatus.OK)
  @Post("refresh")
  async refresh(
    @Req() req: Request,
    @Body("refreshToken") bodyRefreshToken: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Prioriza cookie; cae al body para compat con clientes antiguos.
    const refreshToken =
      req.cookies?.[REFRESH_COOKIE] || bodyRefreshToken || "";
    try {
      const result = await this.auth.refresh(refreshToken);
      setAuthCookies(res, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
      return result;
    } catch (err) {
      clearAuthCookies(res);
      throw err;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post("sign-out")
  async signOut(
    @Req() req: Request & { accessToken?: string; user?: { id: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      req.accessToken || req.cookies?.[ACCESS_COOKIE] || "";
    const userId = req.user?.id;
    const result = await this.auth.signOut(token, userId);
    clearAuthCookies(res);
    return result;
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @Post("request-reset")
  requestReset(@Body("email") email: string) {
    return this.auth.requestPasswordReset(email);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @Post("update-password")
  updatePassword(
    @Body("accessToken") accessToken: string,
    @Body("newPassword") newPassword: string,
  ) {
    return this.auth.updatePassword(accessToken, newPassword);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @HttpCode(HttpStatus.OK)
  @Post("resend-verification")
  resendVerification(
    @Body("email") email: string,
    @Body("password") password: string,
  ) {
    return this.auth.resendVerification(email ?? "", password ?? "");
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @Post("verify-email")
  async verifyEmail(
    @Body("email") email: string,
    @Body("code") code: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.verifyEmail(email ?? "", code ?? "");
    setAuthCookies(res, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    return result;
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @Post("complete-mfa")
  async completeMfa(
    @Body("sessionId") sessionId: string,
    @Body("code") code: string,
    @Body("method") method: "totp" | "email" | "backup",
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.completeMfa(sessionId, code, method);
    setAuthCookies(res, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    return result;
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @HttpCode(HttpStatus.OK)
  @Post("promote-admin")
  promoteAdmin(
    @Body("token") token: string,
    @Body("email") email: string,
    @Body("password") password: string,
  ) {
    return this.auth.promoteAdmin(token, email, password);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 15 } })
  @HttpCode(HttpStatus.OK)
  @Post("demo-sign-in")
  async demoSignIn(
    @Body("role") role: "CUSTOMER" | "ADMIN" | "REPARTIDOR",
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip || req.socket.remoteAddress || undefined;
    const userAgent = req.get("user-agent") || undefined;
    const result = await this.auth.demoSignIn(role, ip, userAgent);
    setAuthCookies(res, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    return result;
  }
}
