import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@allshops/database";
import type {
  InviteUserInput,
  UpdateMembershipInput,
} from "@allshops/contracts";
import { AuthService } from "./auth.service.js";
import type { TenantContext } from "./security.types.js";
import { TokenService } from "./token.service.js";
import { EntitlementService } from "./entitlement.service.js";
import { MailService } from "./mail.service.js";
import { allocateEmployeeNumber } from "./public-identifiers.js";

@Injectable()
export class UsersService {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly entitlements: EntitlementService,
    private readonly mail: MailService,
  ) {}

  list(tenant: TenantContext) {
    return prisma.organizationUser.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...(tenant.branchId ? { branchId: tenant.branchId } : {}),
      },
      select: {
        id: true,
        employeeNumber: true,
        branchId: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true, status: true } },
        role: { select: { id: true, code: true, name: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async invite(
    tenant: TenantContext,
    invitedByUserId: string,
    input: InviteUserInput,
  ) {
    const role = await this.role(tenant.organizationId, input.roleId);
    this.assertRoleAssignable(tenant, role);
    await this.assertBranch(tenant, input.branchId ?? null);
    this.assertRoleScope(role.code, input.branchId ?? null);
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existingUser) {
      const duplicate = await prisma.organizationUser.findUnique({
        where: {
          organizationId_userId: {
            organizationId: tenant.organizationId,
            userId: existingUser.id,
          },
        },
      });
      if (duplicate) {
        throw new ConflictException({
          code: "MEMBERSHIP_ALREADY_EXISTS",
          message: "This user already belongs to the organization.",
        });
      }
      const membership = await prisma.$transaction(async (tx) => {
        await this.entitlements.assertWithinLimit(
          tx,
          tenant.organizationId,
          "users.max",
        );
        const employeeNumber = await allocateEmployeeNumber(
          tx,
          tenant.organizationId,
        );
        const created = await tx.organizationUser.create({
          data: {
            organizationId: tenant.organizationId,
            userId: existingUser.id,
            roleId: role.id,
            branchId: input.branchId ?? null,
            employeeNumber,
            status: "ACTIVE",
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: tenant.organizationId,
            userId: invitedByUserId,
            action: "USER_INVITED",
            entityType: "OrganizationUser",
            entityId: created.id,
            afterJson: {
              invitedUserId: existingUser.id,
              role: role.code,
              existingAccount: true,
            },
          },
        });
        return created;
      });
      return {
        membership,
        userId: existingUser.id,
        employeeNumber: membership.employeeNumber,
        invitationRequired: false,
        emailDelivery: "EXISTING_ACCOUNT",
      };
    }

    const invitationToken = this.tokens.randomInvitationToken();
    const passwordHash = await this.auth.createInvitedPasswordHash();
    const result = await prisma.$transaction(async (tx) => {
      await this.entitlements.assertWithinLimit(
        tx,
        tenant.organizationId,
        "users.max",
      );
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          status: "INVITED",
        },
      });
      const employeeNumber = await allocateEmployeeNumber(
        tx,
        tenant.organizationId,
      );
      const membership = await tx.organizationUser.create({
        data: {
          organizationId: tenant.organizationId,
          userId: user.id,
          roleId: role.id,
          branchId: input.branchId ?? null,
          employeeNumber,
          status: "INVITED",
        },
      });
      const invitation = await tx.invitation.create({
        data: {
          organizationId: tenant.organizationId,
          userId: user.id,
          invitedByUserId,
          roleId: role.id,
          branchId: input.branchId ?? null,
          tokenHash: this.tokens.invitationHash(invitationToken),
          expiresAt: new Date(
            Date.now() +
              Number(process.env.INVITATION_TTL_HOURS ?? 48) * 3_600_000,
          ),
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: tenant.organizationId,
          userId: invitedByUserId,
          action: "USER_INVITED",
          entityType: "OrganizationUser",
          entityId: membership.id,
          afterJson: {
            invitedUserId: user.id,
            role: role.code,
            invitationId: invitation.id,
          },
        },
      });
      return {
        userId: user.id,
        membershipId: membership.id,
        employeeNumber,
        expiresAt: invitation.expiresAt,
      };
    });
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: tenant.organizationId },
      select: {
        name: true,
        logoUrl: true,
        brandPrimaryColor: true,
        brandAccentColor: true,
      },
    });
    const branch = input.branchId
      ? await prisma.branch.findUnique({
          where: { id: input.branchId },
          select: { name: true },
        })
      : null;
    let emailDelivery: "SENT" | "FAILED" | "NOT_CONFIGURED";
    try {
      emailDelivery = (
        await this.mail.sendInvitation({
          recipient: input.email,
          recipientName: input.name,
          organizationName: organization.name,
          roleName: role.name,
          employeeNumber: result.employeeNumber,
          branchName: branch?.name,
          invitationToken,
          expiresAt: result.expiresAt,
          logoUrl: organization.logoUrl,
          primaryColor: organization.brandPrimaryColor,
          accentColor: organization.brandAccentColor,
        })
      ).status;
    } catch {
      emailDelivery = "FAILED";
    }
    return {
      ...result,
      invitationRequired: true,
      emailDelivery,
      ...(process.env.NODE_ENV !== "production" ? { invitationToken } : {}),
    };
  }

  async update(
    tenant: TenantContext,
    actorId: string,
    membershipId: string,
    input: UpdateMembershipInput,
  ) {
    if (
      input.status === "SUSPENDED" &&
      !tenant.permissions.includes("user.remove")
    ) {
      throw new ForbiddenException({
        code: "PERMISSION_DENIED",
        message:
          "The user.remove permission is required to deactivate a membership.",
      });
    }

    const membership = await prisma.organizationUser.findFirst({
      where: {
        id: membershipId,
        organizationId: tenant.organizationId,
        ...(tenant.branchId ? { branchId: tenant.branchId } : {}),
      },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });
    if (!membership)
      throw new NotFoundException({
        code: "MEMBERSHIP_NOT_FOUND",
        message: "Membership not found.",
      });
    const nextRole = input.roleId
      ? await this.role(tenant.organizationId, input.roleId)
      : membership.role;
    this.assertRoleAssignable(tenant, membership.role);
    this.assertRoleAssignable(tenant, nextRole);
    if (membership.id === tenant.membershipId && input.status === "SUSPENDED") {
      throw new ForbiddenException({
        code: "SELF_SUSPENSION_FORBIDDEN",
        message: "You cannot deactivate your own active membership.",
      });
    }
    const nextBranchId =
      input.branchId === undefined ? membership.branchId : input.branchId;
    await this.assertBranch(tenant, nextBranchId);
    this.assertRoleScope(nextRole.code, nextBranchId);

    const removesOwner =
      membership.role.code === "OWNER" &&
      (nextRole.code !== "OWNER" || input.status === "SUSPENDED");
    if (removesOwner) {
      const ownerCount = await prisma.organizationUser.count({
        where: {
          organizationId: tenant.organizationId,
          status: "ACTIVE",
          role: { code: "OWNER" },
        },
      });
      if (ownerCount <= 1) {
        throw new ConflictException({
          code: "LAST_OWNER_REQUIRED",
          message: "The organization must retain at least one active owner.",
        });
      }
    }

    return prisma.$transaction(async (tx) => {
      if (
        membership.status === "SUSPENDED" &&
        input.status &&
        ["ACTIVE", "INVITED"].includes(input.status)
      )
        await this.entitlements.assertWithinLimit(
          tx,
          tenant.organizationId,
          "users.max",
        );
      const updated = await tx.organizationUser.update({
        where: { id: membership.id },
        data: {
          ...(input.roleId ? { roleId: nextRole.id } : {}),
          ...(input.branchId !== undefined ? { branchId: nextBranchId } : {}),
          ...(input.status ? { status: input.status } : {}),
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          role: { select: { id: true, code: true, name: true } },
          branch: { select: { id: true, name: true, code: true } },
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: tenant.organizationId,
          userId: actorId,
          action:
            input.status === "SUSPENDED" ? "USER_REMOVED" : "USER_ROLE_CHANGED",
          entityType: "OrganizationUser",
          entityId: membership.id,
          beforeJson: {
            roleId: membership.roleId,
            branchId: membership.branchId,
            status: membership.status,
          },
          afterJson: input,
        },
      });
      return updated;
    });
  }

  async resendInvitation(
    tenant: TenantContext,
    actorId: string,
    membershipId: string,
  ) {
    const membership = await prisma.organizationUser.findFirst({
      where: {
        id: membershipId,
        organizationId: tenant.organizationId,
        status: "INVITED",
        ...(tenant.branchId ? { branchId: tenant.branchId } : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        role: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        organization: {
          select: {
            name: true,
            logoUrl: true,
            brandPrimaryColor: true,
            brandAccentColor: true,
          },
        },
      },
    });
    if (!membership?.user.email)
      throw new NotFoundException({
        code: "PENDING_INVITATION_NOT_FOUND",
        message: "A pending invitation was not found for this user.",
      });
    const invitationToken = this.tokens.randomInvitationToken();
    const expiresAt = new Date(
      Date.now() + Number(process.env.INVITATION_TTL_HOURS ?? 48) * 3_600_000,
    );
    await prisma.$transaction(async (tx) => {
      await tx.invitation.updateMany({
        where: {
          organizationId: tenant.organizationId,
          userId: membership.user.id,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      const invitation = await tx.invitation.create({
        data: {
          organizationId: tenant.organizationId,
          userId: membership.user.id,
          invitedByUserId: actorId,
          roleId: membership.role.id,
          branchId: membership.branch?.id ?? null,
          tokenHash: this.tokens.invitationHash(invitationToken),
          expiresAt,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: tenant.organizationId,
          userId: actorId,
          action: "USER_INVITATION_RESENT",
          entityType: "Invitation",
          entityId: invitation.id,
          afterJson: { invitedUserId: membership.user.id },
        },
      });
    });
    let emailDelivery: "SENT" | "FAILED" | "NOT_CONFIGURED";
    try {
      emailDelivery = (
        await this.mail.sendInvitation({
          recipient: membership.user.email,
          recipientName: membership.user.name,
          organizationName: membership.organization.name,
          roleName: membership.role.name,
          employeeNumber: membership.employeeNumber,
          branchName: membership.branch?.name,
          invitationToken,
          expiresAt,
          logoUrl: membership.organization.logoUrl,
          primaryColor: membership.organization.brandPrimaryColor,
          accentColor: membership.organization.brandAccentColor,
        })
      ).status;
    } catch {
      emailDelivery = "FAILED";
    }
    return {
      expiresAt,
      emailDelivery,
      ...(process.env.NODE_ENV !== "production" ? { invitationToken } : {}),
    };
  }

  private async role(organizationId: string, roleId: string) {
    const role = await prisma.role.findFirst({
      where: { id: roleId, OR: [{ organizationId: null }, { organizationId }] },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role)
      throw new NotFoundException({
        code: "ROLE_NOT_FOUND",
        message: "Role not found.",
      });
    return role;
  }

  private assertRoleAssignable(
    tenant: TenantContext,
    role: {
      code: string;
      permissions: Array<{ permission: { code: string } }>;
    },
  ): void {
    if (role.code === "OWNER" && tenant.roleCode !== "OWNER") {
      throw new ForbiddenException({
        code: "ROLE_ESCALATION_FORBIDDEN",
        message: "Only an owner can assign or manage the Owner role.",
      });
    }
    const actorPermissions = new Set(tenant.permissions);
    const excess = role.permissions
      .map(({ permission }) => permission.code)
      .filter((permission) => !actorPermissions.has(permission));
    if (excess.length > 0) {
      throw new ForbiddenException({
        code: "ROLE_ESCALATION_FORBIDDEN",
        message:
          "You cannot assign or manage a role with permissions you do not hold.",
      });
    }
  }

  private assertRoleScope(roleCode: string, branchId: string | null): void {
    if (
      ["BRANCH_MANAGER", "POS_SUPERVISOR", "CASHIER", "SERVICE_STAFF"].includes(
        roleCode,
      ) &&
      !branchId
    ) {
      throw new ForbiddenException({
        code: "BRANCH_ASSIGNMENT_REQUIRED",
        message: "This operational role must be assigned to a specific branch.",
      });
    }
  }

  private async assertBranch(
    tenant: TenantContext,
    branchId: string | null,
  ): Promise<void> {
    if (tenant.branchId && branchId !== tenant.branchId) {
      throw new ForbiddenException({
        code: "BRANCH_SCOPE_VIOLATION",
        message: "The selected branch is outside your membership scope.",
      });
    }
    if (branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: branchId, organizationId: tenant.organizationId },
        select: { id: true },
      });
      if (!branch)
        throw new NotFoundException({
          code: "BRANCH_NOT_FOUND",
          message: "Branch not found.",
        });
    }
  }
}
