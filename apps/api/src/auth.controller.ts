import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  acceptInviteSchema,
  loginSchema,
  registerSchema,
} from "@allshops/contracts";

import { AuthRateLimitGuard } from "./auth-rate-limit.guard.js";
import { AuthService } from "./auth.service.js";
import {
  clearRefreshCookie,
  readCookie,
  REFRESH_COOKIE,
  setRefreshCookie,
} from "./cookies.js";
import { Public } from "./public.decorator.js";
import type { RequestContext, ResponseContext } from "./security.types.js";
import { TokenService } from "./token.service.js";
import { parseInput } from "./validation.js";

@ApiTags("Authentication")
@UseGuards(AuthRateLimitGuard)
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  @Public()
  @Post("register")
  async register(
    @Body() body: unknown,
    @Req() request: RequestContext,
    @Res({ passthrough: true }) response: ResponseContext,
  ) {
    const result = await this.auth.register(
      parseInput(registerSchema, body),
      request,
    );
    return this.withCookie(response, result);
  }

  @Public()
  @Post("login")
  async login(
    @Body() body: unknown,
    @Req() request: RequestContext,
    @Res({ passthrough: true }) response: ResponseContext,
  ) {
    const result = await this.auth.login(
      parseInput(loginSchema, body),
      request,
    );
    return this.withCookie(response, result);
  }

  @Public()
  @Post("refresh")
  async refresh(
    @Req() request: RequestContext,
    @Res({ passthrough: true }) response: ResponseContext,
  ) {
    const refreshToken = readCookie(request, REFRESH_COOKIE);
    if (!refreshToken) {
      throw new UnauthorizedException({
        code: "INVALID_REFRESH_TOKEN",
        message: "A refresh token is required.",
      });
    }
    const result = await this.auth.refresh(refreshToken, request);
    return this.withCookie(response, result);
  }

  @Public()
  @Post("logout")
  async logout(
    @Req() request: RequestContext,
    @Res({ passthrough: true }) response: ResponseContext,
  ) {
    const result = await this.auth.logout(
      readCookie(request, REFRESH_COOKIE),
      request,
    );
    clearRefreshCookie(response);
    return result;
  }

  @ApiBearerAuth()
  @Get("me")
  me(@Req() request: RequestContext) {
    return this.auth.me(request.user!.id);
  }

  @Public()
  @Post("accept-invite")
  async acceptInvite(
    @Body() body: unknown,
    @Req() request: RequestContext,
    @Res({ passthrough: true }) response: ResponseContext,
  ) {
    const result = await this.auth.acceptInvite(
      parseInput(acceptInviteSchema, body),
      request,
    );
    return this.withCookie(response, result);
  }

  private withCookie<T extends { refreshToken: string }>(
    response: ResponseContext,
    result: T,
  ): Omit<T, "refreshToken"> {
    setRefreshCookie(
      response,
      result.refreshToken,
      this.tokens.refreshTtlSeconds,
    );
    const safe: Partial<T> & { refreshToken?: string } = { ...result };
    delete safe.refreshToken;
    return safe as Omit<T, "refreshToken">;
  }
}
