import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { prisma } from "@allshops/database";

import { IS_PUBLIC } from "./public.decorator.js";
import type { RequestContext } from "./security.types.js";
import { TokenService } from "./token.service.js";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestContext>();
    const authorization = request.headers.authorization;
    const value = Array.isArray(authorization)
      ? authorization[0]
      : authorization;
    if (!value?.startsWith("Bearer ")) {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "Authentication is required.",
      });
    }

    const payload = this.tokens.verifyAccessToken(value.slice(7));
    const user = await prisma.user.findFirst({
      where: { id: payload.sub, status: "ACTIVE" },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        isPlatformAdmin: true,
      },
    });
    if (!user?.email) {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "The authenticated user is unavailable.",
      });
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        code: "EMAIL_ACTIVATION_REQUIRED",
        message:
          "Activate your email address before accessing your AllShops workspace.",
      });
    }
    request.user = {
      id: user.id,
      email: user.email,
      isPlatformAdmin: user.isPlatformAdmin,
    };
    return true;
  }
}
