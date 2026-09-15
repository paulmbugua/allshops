import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@allshops/database";
import type { CreateBranchInput, UpdateBranchInput } from "@allshops/contracts";
import type { TenantContext } from "./security.types.js";
import { EntitlementService } from "./entitlement.service.js";
import { allocateBranchCode } from "./public-identifiers.js";

@Injectable()
export class BranchesService {
  constructor(private readonly entitlements: EntitlementService) {}
  list(tenant: TenantContext) {
    return prisma.branch.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...(tenant.branchId ? { id: tenant.branchId } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async get(tenant: TenantContext, branchId: string) {
    const branch = await prisma.branch.findFirst({
      where: {
        id: branchId,
        organizationId: tenant.organizationId,
        ...(tenant.branchId ? { id: tenant.branchId } : {}),
      },
    });
    if (!branch)
      throw new NotFoundException({
        code: "BRANCH_NOT_FOUND",
        message: "Branch not found.",
      });
    return branch;
  }

  async create(
    tenant: TenantContext,
    userId: string,
    input: CreateBranchInput,
  ) {
    if (tenant.branchId) {
      throw new ForbiddenException({
        code: "BRANCH_SCOPE_VIOLATION",
        message: "A branch-scoped membership cannot create another branch.",
      });
    }
    if (
      (await prisma.branch.count({
        where: { organizationId: tenant.organizationId, isActive: true },
      })) > 0
    )
      await this.entitlements.assertFeature(
        tenant.organizationId,
        "multi_branch",
      );
    return prisma.$transaction(async (tx) => {
      await this.entitlements.assertWithinLimit(
        tx,
        tenant.organizationId,
        "branches.max",
      );
      const code = await allocateBranchCode(
        tx,
        tenant.organizationId,
        input.name,
      );
      const branch = await tx.branch.create({
        data: {
          organizationId: tenant.organizationId,
          name: input.name,
          code,
          phone: input.phone,
          email: input.email,
          address: input.address,
          timezone: input.timezone,
        },
      });
      await tx.stockLocation.create({
        data: {
          organizationId: tenant.organizationId,
          branchId: branch.id,
          name: "Main Stock",
          normalizedName: "main stock",
          type: "DEFAULT",
          isDefault: true,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: tenant.organizationId,
          userId,
          action: "BRANCH_CREATED",
          entityType: "Branch",
          entityId: branch.id,
          afterJson: { name: branch.name, code: branch.code },
        },
      });
      return branch;
    });
  }

  async update(
    tenant: TenantContext,
    userId: string,
    branchId: string,
    input: UpdateBranchInput,
  ) {
    const current = await this.get(tenant, branchId);
    return prisma.$transaction(async (tx) => {
      if (!current.isActive && input.isActive === true)
        await this.entitlements.assertWithinLimit(
          tx,
          tenant.organizationId,
          "branches.max",
        );
      const branch = await tx.branch.update({
        where: { id: current.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: tenant.organizationId,
          userId,
          action: "BRANCH_UPDATED",
          entityType: "Branch",
          entityId: branch.id,
          beforeJson: current,
          afterJson: input,
        },
      });
      return branch;
    });
  }
}
