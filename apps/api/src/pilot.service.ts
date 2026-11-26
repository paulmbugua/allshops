import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma, type SupportIssueStatus } from "@allshops/database";
import type { TenantContext } from "./security.types.js";
import { supportFaqsFor } from "./support-faqs.js";

const STEP_CODES = [
  "BUSINESS_PROFILE",
  "BRANCH",
  "USERS_ROLES",
  "CATALOGUE",
  "OPENING_STOCK",
  "DEVICE",
  "PAYMENT_METHODS",
  "TEST_SALE",
  "TRAINING",
  "SUBSCRIPTION",
] as const;

const transitions: Record<string, string[]> = {
  PENDING_SETUP: ["ONBOARDING"],
  ONBOARDING: ["READY_FOR_UAT", "PAUSED"],
  READY_FOR_UAT: ["PILOT_ACTIVE", "PAUSED"],
  PILOT_ACTIVE: ["PAUSED", "GRADUATED"],
  PAUSED: ["ONBOARDING", "PILOT_ACTIVE", "EXITED"],
  GRADUATED: [],
  EXITED: [],
};

@Injectable()
export class PilotService {
  private assertPlatform(isPlatformAdmin: boolean) {
    if (!isPlatformAdmin)
      throw new ForbiddenException({
        code: "PLATFORM_ONLY",
        message: "Platform access is required.",
      });
  }

  async getOnboarding(organizationId: string) {
    const steps = await prisma.organizationOnboardingStep.findMany({
      where: { organizationId },
      orderBy: { stepCode: "asc" },
    });
    const byCode = new Map(steps.map((step) => [step.stepCode, step]));
    return STEP_CODES.map(
      (stepCode) =>
        byCode.get(stepCode) ?? {
          organizationId,
          stepCode,
          status: "PENDING",
          completedAt: null,
        },
    );
  }

  async completeStep(organizationId: string, stepCode: string, userId: string) {
    if (!STEP_CODES.includes(stepCode as (typeof STEP_CODES)[number]))
      throw new BadRequestException({
        code: "INVALID_ONBOARDING_STEP",
        message: "Unknown onboarding step.",
      });
    return prisma.organizationOnboardingStep.upsert({
      where: { organizationId_stepCode: { organizationId, stepCode } },
      create: {
        organizationId,
        stepCode,
        status: "COMPLETED",
        completedAt: new Date(),
        completedBy: userId,
      },
      update: {
        status: "COMPLETED",
        completedAt: new Date(),
        completedBy: userId,
      },
    });
  }

  async readiness(organizationId: string) {
    const [
      organization,
      branchCount,
      ownerCount,
      posUserCount,
      productCount,
      locationCount,
      deviceCount,
    ] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: organizationId },
        include: { subscription: { select: { status: true } } },
      }),
      prisma.branch.count({ where: { organizationId, isActive: true } }),
      prisma.organizationUser.count({
        where: { organizationId, status: "ACTIVE", role: { code: "OWNER" } },
      }),
      prisma.organizationUser.count({
        where: {
          organizationId,
          status: "ACTIVE",
          role: { code: { in: ["OWNER", "ADMIN", "MANAGER", "CASHIER"] } },
        },
      }),
      prisma.product.count({
        where: {
          organizationId,
          isActive: true,
          type: { in: ["STOCK_ITEM", "SERVICE", "NON_STOCK_ITEM"] },
        },
      }),
      prisma.stockLocation.count({ where: { organizationId, isActive: true } }),
      prisma.device.count({ where: { organizationId, status: "ACTIVE" } }),
    ]);
    if (!organization)
      throw new NotFoundException({
        code: "ORGANIZATION_NOT_FOUND",
        message: "Organization not found.",
      });
    const checks = [
      {
        code: "ORGANIZATION_ACTIVE",
        status:
          organization.status === "TRIAL" || organization.status === "ACTIVE"
            ? "PASS"
            : "FAIL",
      },
      {
        code: "SUBSCRIPTION_USABLE",
        status: ["TRIALING", "ACTIVE", "GRACE_PERIOD"].includes(
          organization.subscription?.status ?? "",
        )
          ? "PASS"
          : "FAIL",
      },
      { code: "BRANCH_EXISTS", status: branchCount > 0 ? "PASS" : "FAIL" },
      { code: "OWNER_EXISTS", status: ownerCount > 0 ? "PASS" : "FAIL" },
      { code: "POS_USER_EXISTS", status: posUserCount > 0 ? "PASS" : "FAIL" },
      { code: "CATALOGUE_EXISTS", status: productCount > 0 ? "PASS" : "FAIL" },
      {
        code: "STOCK_LOCATION_EXISTS",
        status: locationCount > 0 ? "PASS" : "FAIL",
      },
      { code: "DEVICE_REGISTERED", status: deviceCount > 0 ? "PASS" : "FAIL" },
    ];
    return { ready: checks.every((check) => check.status === "PASS"), checks };
  }

  async createOrGetPilot(organizationId: string, isPlatformAdmin: boolean) {
    this.assertPlatform(isPlatformAdmin);
    return prisma.pilotOrganization.upsert({
      where: { organizationId },
      create: { organizationId, status: "PENDING_SETUP" },
      update: {},
    });
  }

  async listPilots(isPlatformAdmin: boolean) {
    this.assertPlatform(isPlatformAdmin);
    return prisma.pilotOrganization.findMany({
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            businessType: true,
            status: true,
            subscription: {
              select: { status: true, plan: { select: { code: true } } },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  async transition(
    organizationId: string,
    target: string,
    isPlatformAdmin: boolean,
    actorId: string,
    reason?: string,
  ) {
    this.assertPlatform(isPlatformAdmin);
    const current = await prisma.pilotOrganization.findUnique({
      where: { organizationId },
    });
    if (!current)
      throw new NotFoundException({
        code: "PILOT_NOT_FOUND",
        message: "Pilot record not found.",
      });
    if (!(transitions[current.status] ?? []).includes(target))
      throw new BadRequestException({
        code: "INVALID_PILOT_TRANSITION",
        message: `${current.status} cannot transition to ${target}.`,
      });
    if (target === "PILOT_ACTIVE") {
      const readiness = await this.readiness(organizationId);
      if (!readiness.ready && !reason)
        throw new BadRequestException({
          code: "PILOT_NOT_READY",
          message:
            "Readiness checks must pass or a documented override reason is required.",
        });
    }
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      const pilot = await tx.pilotOrganization.update({
        where: { organizationId },
        data: {
          status: target as never,
          ...(target === "PILOT_ACTIVE" ? { pilotStartedAt: now } : {}),
          ...(target === "GRADUATED" || target === "EXITED"
            ? { pilotEndedAt: now }
            : {}),
          ...(reason ? { notes: reason } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: actorId,
          action: `PILOT_${target}`,
          entityType: "PilotOrganization",
          entityId: pilot.id,
          afterJson: { target, reason },
        },
      });
      return pilot;
    });
  }

  async setFlag(
    organizationId: string,
    featureCode: string,
    enabled: boolean,
    isPlatformAdmin: boolean,
  ) {
    this.assertPlatform(isPlatformAdmin);
    return prisma.organizationFeatureFlag.upsert({
      where: { organizationId_featureCode: { organizationId, featureCode } },
      create: { organizationId, featureCode, enabled },
      update: { enabled },
    });
  }

  async diagnostics(organizationId: string, tenant: TenantContext) {
    const [organization, devices, conflicts, pilot] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
          id: true,
          status: true,
          subscription: {
            select: { status: true, plan: { select: { code: true } } },
          },
        },
      }),
      prisma.device.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          status: true,
          lastSeenAt: true,
          lastSyncAt: true,
          offlineEntitled: true,
        },
      }),
      prisma.offlineTransaction.count({
        where: { organizationId, status: "CONFLICT" },
      }),
      prisma.pilotOrganization.findUnique({
        where: { organizationId },
        select: { status: true, updatedAt: true },
      }),
    ]);
    if (!organization)
      throw new NotFoundException({
        code: "ORGANIZATION_NOT_FOUND",
        message: "Organization not found.",
      });
    return {
      appVersion: process.env.APP_VERSION ?? "unknown",
      organization,
      pilot,
      devices,
      pendingSyncConflicts: conflicts,
      supportProfile: {
        roleCode: tenant.roleCode,
        branchScoped: tenant.branchId !== null,
        faqs: supportFaqsFor(tenant),
      },
    };
  }

  async platformOverview(isPlatformAdmin: boolean) {
    this.assertPlatform(isPlatformAdmin);
    const [workspaces, activeSubscriptions, openIssues, expiredSubscriptions] =
      await Promise.all([
        prisma.organization.count(),
        prisma.subscription.count({ where: { status: "ACTIVE" } }),
        prisma.supportIssue.count({
          where: { status: { in: ["OPEN", "TRIAGED", "IN_PROGRESS"] } },
        }),
        prisma.subscription.count({ where: { status: "EXPIRED" } }),
      ]);
    return {
      workspaces,
      activeSubscriptions,
      openIssues,
      expiredSubscriptions,
    };
  }

  async platformIssues(
    isPlatformAdmin: boolean,
    filters: { status?: SupportIssueStatus; search?: string; page: number },
  ) {
    this.assertPlatform(isPlatformAdmin);
    return prisma.supportIssue.findMany({
      where: {
        status: filters.status,
        ...(filters.search
          ? {
              OR: [
                { title: { contains: filters.search, mode: "insensitive" } },
                { requestId: { equals: filters.search } },
                {
                  organization: {
                    name: { contains: filters.search, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (filters.page - 1) * 40,
      take: 40,
      select: {
        id: true,
        organizationId: true,
        category: true,
        severity: true,
        title: true,
        status: true,
        requestId: true,
        createdAt: true,
        updatedAt: true,
        organization: { select: { name: true } },
      },
    });
  }

  async platformIssue(isPlatformAdmin: boolean, id: string) {
    this.assertPlatform(isPlatformAdmin);
    const issue = await prisma.supportIssue.findUnique({
      where: { id },
      include: {
        reporter: { select: { name: true, email: true } },
        organization: {
          select: {
            name: true,
            subscription: { select: { id: true, status: true } },
          },
        },
      },
    });
    if (!issue) throw new NotFoundException("Support request not found.");
    return issue;
  }

  async updatePlatformIssue(
    isPlatformAdmin: boolean,
    actorId: string,
    id: string,
    input: {
      status: SupportIssueStatus;
      resolutionNote: string;
      updatedAt: string;
    },
  ) {
    this.assertPlatform(isPlatformAdmin);
    return prisma.$transaction(async (tx) => {
      const current = await tx.supportIssue.findUnique({ where: { id } });
      if (!current) throw new NotFoundException("Support request not found.");
      const complete = input.status === "RESOLVED" || input.status === "CLOSED";
      const changed = await tx.supportIssue.updateMany({
        where: { id, updatedAt: new Date(input.updatedAt) },
        data: {
          status: input.status,
          resolutionNote: input.resolutionNote,
          resolvedAt: complete ? (current.resolvedAt ?? new Date()) : null,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          "This request was updated. Reload it before saving.",
        );
      }
      await tx.auditLog.create({
        data: {
          organizationId: current.organizationId,
          userId: actorId,
          action: "SUPPORT_ISSUE_UPDATED",
          entityType: "SupportIssue",
          entityId: id,
          beforeJson: {
            status: current.status,
            resolutionNote: current.resolutionNote,
          },
          afterJson: {
            status: input.status,
            resolutionNote: input.resolutionNote,
          },
        },
      });
      return tx.supportIssue.findUniqueOrThrow({ where: { id } });
    });
  }

  async feedback(
    organizationId: string,
    submittedBy: string,
    input: { category: string; title: string; description: string },
  ) {
    if (
      !input.title?.trim() ||
      !input.description?.trim() ||
      input.description.length > 10_000
    )
      throw new BadRequestException({
        code: "INVALID_FEEDBACK",
        message: "Feedback title and description are required.",
      });
    return prisma.pilotFeedback.create({
      data: {
        organizationId,
        submittedBy,
        category: input.category as never,
        title: input.title.trim().slice(0, 200),
        description: input.description.trim(),
      },
    });
  }

  async platformFeedback(isPlatformAdmin: boolean) {
    this.assertPlatform(isPlatformAdmin);
    return prisma.pilotFeedback.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        organizationId: true,
        category: true,
        title: true,
        description: true,
        createdAt: true,
      },
    });
  }
}
