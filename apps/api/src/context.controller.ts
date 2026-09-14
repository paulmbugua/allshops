import { Controller, Get, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { prisma } from "@allshops/database";
import { RequirePermission } from "./permissions.decorator.js";
import type { RequestContext } from "./security.types.js";

@ApiTags("Roles and audit")
@ApiBearerAuth()
@Controller("organizations/:organizationId")
export class ContextController {
  @RequirePermission("role.read")
  @Get("roles")
  async roles(@Req() request: RequestContext) {
    const roles = await prisma.role.findMany({
      where: {
        OR: [
          { organizationId: null, isSystemRole: true },
          { organizationId: request.tenant!.organizationId },
        ],
      },
      select: {
        id: true,
        name: true,
        code: true,
        isSystemRole: true,
        permissions: {
          select: { permission: { select: { code: true, description: true } } },
        },
      },
      orderBy: { code: "asc" },
    });
    const held = new Set(request.tenant!.permissions);
    return roles.filter(
      (role) =>
        (role.code !== "OWNER" || request.tenant!.roleCode === "OWNER") &&
        role.permissions.every(({ permission }) => held.has(permission.code)),
    );
  }
  @RequirePermission("audit.read")
  @Get("audit-logs")
  audit(@Req() request: RequestContext) {
    return prisma.auditLog.findMany({
      where: { organizationId: request.tenant!.organizationId },
      select: {
        id: true,
        userId: true,
        action: true,
        entityType: true,
        entityId: true,
        ipAddress: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
}
