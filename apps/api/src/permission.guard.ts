import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { prisma } from "@allshops/database";

import {
  REQUIRED_ANY_PERMISSIONS,
  REQUIRED_PERMISSIONS,
} from "./permissions.decorator.js";
import type { RequestContext } from "./security.types.js";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const requiredAny =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_ANY_PERMISSIONS, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (required.length === 0 && requiredAny.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestContext>();
    const organizationId = request.params?.organizationId;
    if (!organizationId || !request.user) {
      throw this.forbidden();
    }
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        organizationId,
      )
    ) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "organizationId must be a valid UUID.",
      });
    }
    const membership = await prisma.organizationUser.findFirst({
      where: {
        organizationId,
        userId: request.user.id,
        status: "ACTIVE",
        organization: { status: { in: ["TRIAL", "ACTIVE"] } },
      },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });
    if (!membership) {
      throw this.forbidden();
    }
    const permissions = membership.role.permissions.map(
      ({ permission }) => permission.code,
    );
    if (
      !required.every((permission) => permissions.includes(permission)) ||
      (requiredAny.length > 0 &&
        !requiredAny.some((permission) => permissions.includes(permission)))
    ) {
      throw this.forbidden();
    }
    request.tenant = {
      organizationId,
      membershipId: membership.id,
      roleId: membership.roleId,
      roleCode: membership.role.code,
      branchId: membership.branchId,
      permissions,
    };
    return true;
  }

  private forbidden(): ForbiddenException {
    return new ForbiddenException({
      code: "FORBIDDEN",
      message: "You do not have permission to perform this action.",
    });
  }
}
