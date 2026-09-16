import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@allshops/database";
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
} from "@allshops/contracts";
import {
  employeePrefix,
  formatEmployeeNumber,
} from "./public-identifiers.js";

@Injectable()
export class OrganizationsService {
  async create(userId: string, input: CreateOrganizationInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerifiedAt: true },
    });
    if (!user?.emailVerifiedAt) {
      throw new ForbiddenException({
        code: "EMAIL_ACTIVATION_REQUIRED",
        message:
          "Activate your email address before creating an AllShops business.",
      });
    }
    const ownerRole = await prisma.role.findFirst({
      where: { organizationId: null, code: "OWNER", isSystemRole: true },
    });
    if (!ownerRole) throw new Error("OWNER role is not seeded");
    const trialPlan = await prisma.plan.findUnique({
      where: { code: "GROWTH" },
    });
    if (!trialPlan) throw new Error("GROWTH trial plan is not seeded");
    const trialDays = Number(process.env.TRIAL_DAYS ?? 30);
    if (!Number.isFinite(trialDays) || trialDays <= 0)
      throw new Error("TRIAL_DAYS must be a positive number");
    return prisma.$transaction(async (tx) => {
      const prefix = employeePrefix(input.name);
      const organization = await tx.organization.create({
        data: {
          name: input.name,
          legalName: input.legalName,
          arabicName: input.arabicName,
          businessType: input.businessType,
          registrationNumber: input.registrationNumber,
          email: input.email,
          phone: input.phone,
          currency: input.currency,
          timezone: input.timezone,
          employeePrefix: prefix,
          nextEmployeeNumber: 2,
        },
      });
      await tx.organizationUser.create({
        data: {
          organizationId: organization.id,
          userId,
          roleId: ownerRole.id,
          employeeNumber: formatEmployeeNumber(prefix, 1),
          status: "ACTIVE",
        },
      });
      const trialStartedAt = new Date();
      const subscription = await tx.subscription.create({
        data: {
          organizationId: organization.id,
          planId: trialPlan.id,
          status: "TRIALING",
          billingInterval: "MONTHLY",
          currency: organization.currency,
          trialStartedAt,
          trialEndsAt: new Date(
            trialStartedAt.getTime() + trialDays * 86_400_000,
          ),
        },
      });
      await tx.subscriptionEvent.create({
        data: {
          organizationId: organization.id,
          subscriptionId: subscription.id,
          eventType: "TRIAL_STARTED",
          toPlanId: trialPlan.id,
          toStatus: "TRIALING",
          createdBy: userId,
        },
      });
      await tx.unit.createMany({
        data: [
          ["Piece", "pcs"],
          ["Kilogram", "kg"],
          ["Liter", "L"],
          ["Meter", "m"],
          ["Box", "box"],
          ["Pack", "pack"],
          ["Service", "svc"],
        ].map(([name, symbol]) => ({
          organizationId: organization.id,
          name: name!,
          normalizedName: name!.toLocaleLowerCase("en"),
          symbol: symbol!,
        })),
      });
      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          userId,
          action: "ORGANIZATION_CREATED",
          entityType: "Organization",
          entityId: organization.id,
          afterJson: { name: organization.name },
        },
      });
      return organization;
    });
  }

  async get(organizationId: string) {
    const organization = await prisma.organization.findFirst({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        legalName: true,
        arabicName: true,
        businessType: true,
        registrationNumber: true,
        email: true,
        phone: true,
        logoUrl: true,
        welcomeHeadline: true,
        tagline: true,
        motto: true,
        welcomeMessage: true,
        brandPrimaryColor: true,
        brandAccentColor: true,
        idleTimeoutMinutes: true,
        employeePrefix: true,
        currency: true,
        timezone: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!organization) {
      throw new NotFoundException({
        code: "ORGANIZATION_NOT_FOUND",
        message: "Organization not found.",
      });
    }
    return organization;
  }

  async welcome(organizationId: string) {
    const organization = await prisma.organization.findFirst({
      where: { id: organizationId, status: { not: "CANCELLED" } },
      select: {
        id: true,
        name: true,
        arabicName: true,
        logoUrl: true,
        welcomeHeadline: true,
        tagline: true,
        motto: true,
        welcomeMessage: true,
        brandPrimaryColor: true,
        brandAccentColor: true,
        idleTimeoutMinutes: true,
        phone: true,
        email: true,
      },
    });
    if (!organization) {
      throw new NotFoundException({
        code: "SHOP_WELCOME_NOT_FOUND",
        message: "This shop welcome screen is unavailable.",
      });
    }
    return organization;
  }

  async update(
    organizationId: string,
    userId: string,
    input: UpdateOrganizationInput,
  ) {
    const current = await this.get(organizationId);
    return prisma.$transaction(async (tx) => {
      const updated = await tx.organization.update({
        where: { id: organizationId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.legalName !== undefined
            ? { legalName: input.legalName }
            : {}),
          ...(input.arabicName !== undefined
            ? { arabicName: input.arabicName }
            : {}),
          ...(input.businessType !== undefined
            ? { businessType: input.businessType }
            : {}),
          ...(input.registrationNumber !== undefined
            ? { registrationNumber: input.registrationNumber }
            : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
          ...(input.welcomeHeadline !== undefined
            ? { welcomeHeadline: input.welcomeHeadline }
            : {}),
          ...(input.tagline !== undefined ? { tagline: input.tagline } : {}),
          ...(input.motto !== undefined ? { motto: input.motto } : {}),
          ...(input.welcomeMessage !== undefined
            ? { welcomeMessage: input.welcomeMessage }
            : {}),
          ...(input.brandPrimaryColor !== undefined
            ? { brandPrimaryColor: input.brandPrimaryColor.toUpperCase() }
            : {}),
          ...(input.brandAccentColor !== undefined
            ? { brandAccentColor: input.brandAccentColor.toUpperCase() }
            : {}),
          ...(input.idleTimeoutMinutes !== undefined
            ? { idleTimeoutMinutes: input.idleTimeoutMinutes }
            : {}),
          ...(input.currency !== undefined ? { currency: input.currency } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: "ORGANIZATION_UPDATED",
          entityType: "Organization",
          entityId: organizationId,
          beforeJson: current,
          afterJson: input,
        },
      });
      return updated;
    });
  }
}
