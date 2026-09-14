import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, prisma } from "@allshops/database";
import type { SubscriptionStatus } from "@allshops/database";
import type {
  ConfirmSubscriptionPaymentInput,
  ExtendTrialInput,
  PlatformChangePlanInput,
  PlatformSubscriptionListInput,
  SelectPlanInput,
  SubscriptionActionInput,
} from "@allshops/contracts";
import { EntitlementService } from "./entitlement.service.js";

@Injectable()
export class SubscriptionsService {
  constructor(private readonly entitlements: EntitlementService) {}

  plans() {
    return prisma.plan.findMany({
      where: { isActive: true, isPublic: true },
      include: { features: { orderBy: { featureCode: "asc" } }, limits: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  async details(organizationId: string) {
    const entitlement = await this.entitlements.resolve(organizationId);
    return {
      id: entitlement.subscription.id,
      status: entitlement.subscription.status,
      billingInterval: entitlement.subscription.billingInterval,
      currentPeriodStart: entitlement.subscription.currentPeriodStart,
      currentPeriodEnd: entitlement.subscription.currentPeriodEnd,
      trialEndsAt: entitlement.subscription.trialEndsAt,
      graceEndsAt: entitlement.subscription.graceEndsAt,
      cancelAtPeriodEnd: entitlement.subscription.cancelAtPeriodEnd,
      plan: {
        id: entitlement.plan.id,
        code: entitlement.plan.code,
        name: entitlement.plan.name,
        currency: entitlement.plan.currency,
      },
      pendingPlan: entitlement.subscription.pendingPlan
        ? {
            code: entitlement.subscription.pendingPlan.code,
            name: entitlement.subscription.pendingPlan.name,
            effectiveAt: entitlement.subscription.changeEffectiveAt,
          }
        : null,
      features: entitlement.features,
      limits: entitlement.limits,
    };
  }

  usage(organizationId: string) {
    return this.entitlements.usage(organizationId);
  }

  billing(organizationId: string) {
    return prisma.billingRecord.findMany({
      where: { organizationId },
      select: {
        id: true,
        billingNumber: true,
        planCodeSnapshot: true,
        planNameSnapshot: true,
        billingInterval: true,
        periodStart: true,
        periodEnd: true,
        amountMinor: true,
        currency: true,
        status: true,
        paymentMethod: true,
        paymentReference: true,
        dueAt: true,
        paidAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async selectPlan(
    organizationId: string,
    userId: string,
    input: SelectPlanInput,
  ) {
    return prisma.$transaction(
      async (tx) => {
        await this.lock(tx, organizationId, "billing.select-plan");
        const subscription = await tx.subscription.findUnique({
          where: { organizationId },
          include: { plan: true },
        });
        const target = await tx.plan.findFirst({
          where: { code: input.planCode, isActive: true, isPublic: true },
        });
        if (!subscription || !target)
          throw new NotFoundException({
            code: "PLAN_NOT_FOUND",
            message: "Plan not found.",
          });
        if (target.code === "ENTERPRISE")
          throw new ConflictException({
            code: "ENTERPRISE_CONTACT_REQUIRED",
            message: "Enterprise plans require platform-assisted activation.",
          });
        if (
          subscription.status === "ACTIVE" &&
          target.sortOrder < subscription.plan.sortOrder &&
          subscription.currentPeriodEnd
        ) {
          const usage = await this.entitlements.usage(organizationId);
          const targetLimits = await tx.planLimit.findMany({
            where: { planId: target.id },
          });
          const blockers = targetLimits.flatMap((limit) => {
            const key = limit.limitCode.split(".")[0] as keyof typeof usage;
            const current = usage[key]?.current ?? 0;
            return limit.value !== null && current > limit.value
              ? [{ limitCode: limit.limitCode, current, maximum: limit.value }]
              : [];
          });
          if (blockers.length)
            throw new ConflictException({
              code: "PLAN_DOWNGRADE_BLOCKED",
              message: "Reduce active usage before scheduling this downgrade.",
              blockers,
            });
          const updated = await tx.subscription.update({
            where: { id: subscription.id },
            data: {
              pendingPlanId: target.id,
              changeEffectiveAt: subscription.currentPeriodEnd,
              version: { increment: 1 },
            },
          });
          await this.event(
            tx,
            subscription,
            "PLAN_DOWNGRADE_SCHEDULED",
            userId,
            {
              toPlanId: target.id,
            },
          );
          return {
            subscription: updated,
            billingRecord: null,
            scheduled: true,
          };
        }
        const periodStart = new Date();
        const periodEnd = this.periodEnd(periodStart, input.billingInterval);
        const amountMinor =
          input.billingInterval === "ANNUAL"
            ? target.annualPriceMinor
            : target.monthlyPriceMinor;
        const billingNumber = await this.nextBillingNumber(
          tx,
          organizationId,
          periodStart,
        );
        const bill = await tx.billingRecord.create({
          data: {
            organizationId,
            subscriptionId: subscription.id,
            planId: target.id,
            billingNumber,
            planCodeSnapshot: target.code,
            planNameSnapshot: target.name,
            billingInterval: input.billingInterval,
            periodStart,
            periodEnd,
            amountMinor,
            currency: target.currency,
            dueAt: periodStart,
          },
        });
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            pendingPlanId: target.id,
            billingInterval: input.billingInterval,
            version: { increment: 1 },
          },
        });
        await this.event(tx, subscription, "PLAN_SELECTED", userId, {
          toPlanId: target.id,
          metadata: { billingRecordId: bill.id },
        });
        return { billingRecord: bill, scheduled: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async cancel(organizationId: string, userId: string) {
    const current = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId },
    });
    if (!current.currentPeriodEnd)
      throw new ConflictException({
        code: "NO_ACTIVE_PERIOD",
        message: "No paid period can be cancelled.",
      });
    const updated = await prisma.subscription.update({
      where: { id: current.id },
      data: {
        cancelAtPeriodEnd: true,
        cancelledAt: new Date(),
        status: "CANCELLED",
        version: { increment: 1 },
      },
    });
    await prisma.subscriptionEvent.create({
      data: {
        organizationId,
        subscriptionId: current.id,
        eventType: "SUBSCRIPTION_CANCELLED",
        fromStatus: current.status,
        toStatus: "CANCELLED",
        createdBy: userId,
      },
    });
    return updated;
  }

  async resume(organizationId: string, userId: string) {
    const current = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId },
    });
    if (
      !current.cancelAtPeriodEnd ||
      !current.currentPeriodEnd ||
      current.currentPeriodEnd <= new Date()
    )
      throw new ConflictException({
        code: "SUBSCRIPTION_NOT_RESUMABLE",
        message: "Subscription cannot be resumed.",
      });
    const updated = await prisma.subscription.update({
      where: { id: current.id },
      data: {
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        status: "ACTIVE",
        version: { increment: 1 },
      },
    });
    await prisma.subscriptionEvent.create({
      data: {
        organizationId,
        subscriptionId: current.id,
        eventType: "SUBSCRIPTION_RESUMED",
        fromStatus: current.status,
        toStatus: "ACTIVE",
        createdBy: userId,
      },
    });
    return updated;
  }

  platformList(
    actorIsPlatformAdmin: boolean,
    input: PlatformSubscriptionListInput,
  ) {
    this.platform(actorIsPlatformAdmin);
    return prisma.subscription.findMany({
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.planCode ? { plan: { code: input.planCode } } : {}),
        ...(input.search
          ? {
              organization: {
                name: { contains: input.search, mode: "insensitive" },
              },
            }
          : {}),
      },
      include: {
        organization: { select: { id: true, name: true } },
        plan: true,
        pendingPlan: true,
      },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      orderBy: { updatedAt: "desc" },
    });
  }

  async platformGet(actorIsPlatformAdmin: boolean, id: string) {
    this.platform(actorIsPlatformAdmin);
    const result = await prisma.subscription.findUnique({
      where: { id },
      include: {
        organization: true,
        plan: { include: { features: true, limits: true } },
        pendingPlan: true,
        billingRecords: { orderBy: { createdAt: "desc" } },
        events: { orderBy: { occurredAt: "desc" }, take: 100 },
      },
    });
    if (!result)
      throw new NotFoundException({
        code: "SUBSCRIPTION_NOT_FOUND",
        message: "Subscription not found.",
      });
    return result;
  }

  async confirmPayment(
    actorId: string,
    actorIsPlatformAdmin: boolean,
    subscriptionId: string,
    key: string,
    input: ConfirmSubscriptionPaymentInput,
  ) {
    this.platform(actorIsPlatformAdmin);
    return prisma.$transaction(
      async (tx) => {
        await this.lock(tx, subscriptionId, "billing.confirm");
        const reused = await tx.billingRecord.findUnique({
          where: { confirmationKey: key },
        });
        if (reused) {
          if (reused.id !== input.billingRecordId)
            throw new ConflictException({
              code: "IDEMPOTENCY_KEY_REUSE_MISMATCH",
              message: "Key belongs to another billing record.",
            });
          return reused;
        }
        const bill = await tx.billingRecord.findFirst({
          where: { id: input.billingRecordId, subscriptionId },
        });
        if (!bill)
          throw new NotFoundException({
            code: "BILLING_RECORD_NOT_FOUND",
            message: "Billing record not found.",
          });
        if (bill.status === "PAID") return bill;
        if (bill.status !== "DUE")
          throw new ConflictException({
            code: "BILLING_RECORD_NOT_DUE",
            message: "Billing record is not payable.",
          });
        const subscription = await tx.subscription.findUniqueOrThrow({
          where: { id: subscriptionId },
        });
        const now = new Date();
        const periodStart =
          subscription.planId === bill.planId &&
          subscription.currentPeriodEnd &&
          subscription.currentPeriodEnd > now
            ? subscription.currentPeriodEnd
            : now;
        const periodEnd = this.periodEnd(periodStart, bill.billingInterval);
        const paid = await tx.billingRecord.update({
          where: { id: bill.id },
          data: {
            status: "PAID",
            paymentMethod: input.paymentMethod,
            paymentReference: input.paymentReference,
            paidAt: now,
            confirmedBy: actorId,
            confirmationKey: key,
            periodStart,
            periodEnd,
          },
        });
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            planId: bill.planId,
            pendingPlanId: null,
            status: "ACTIVE",
            billingInterval: bill.billingInterval,
            currency: bill.currency,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            activatedAt: subscription.activatedAt ?? now,
            suspendedAt: null,
            graceEndsAt: null,
            cancelAtPeriodEnd: false,
            cancelledAt: null,
            version: { increment: 1 },
          },
        });
        await this.event(
          tx,
          subscription,
          "SUBSCRIPTION_PAYMENT_CONFIRMED",
          actorId,
          {
            toPlanId: bill.planId,
            toStatus: "ACTIVE",
            metadata: { billingRecordId: bill.id },
          },
        );
        return paid;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async extendTrial(
    actorId: string,
    isAdmin: boolean,
    id: string,
    input: ExtendTrialInput,
  ) {
    this.platform(isAdmin);
    const current = await prisma.subscription.findUniqueOrThrow({
      where: { id },
    });
    if (!current.trialEndsAt)
      throw new ConflictException({
        code: "NO_TRIAL",
        message: "Subscription has no trial.",
      });
    const updated = await prisma.subscription.update({
      where: { id },
      data: {
        trialEndsAt: new Date(
          current.trialEndsAt.getTime() + input.days * 86_400_000,
        ),
        status: "TRIALING",
        version: { increment: 1 },
      },
    });
    await prisma.subscriptionEvent.create({
      data: {
        organizationId: current.organizationId,
        subscriptionId: id,
        eventType: "TRIAL_EXTENDED",
        fromStatus: current.status,
        toStatus: "TRIALING",
        createdBy: actorId,
        metadata: { days: input.days, reason: input.reason },
      },
    });
    return updated;
  }

  async suspend(
    actorId: string,
    isAdmin: boolean,
    id: string,
    input: SubscriptionActionInput,
  ) {
    return this.platformStatus(
      actorId,
      isAdmin,
      id,
      "SUSPENDED",
      "SUBSCRIPTION_SUSPENDED",
      input.reason,
    );
  }

  async reactivate(
    actorId: string,
    isAdmin: boolean,
    id: string,
    input: SubscriptionActionInput,
  ) {
    return this.platformStatus(
      actorId,
      isAdmin,
      id,
      "ACTIVE",
      "SUBSCRIPTION_REACTIVATED",
      input.reason,
    );
  }

  async changePlan(
    actorId: string,
    isAdmin: boolean,
    id: string,
    input: PlatformChangePlanInput,
  ) {
    this.platform(isAdmin);
    const plan = await prisma.plan.findUnique({
      where: { code: input.planCode },
    });
    const current = await prisma.subscription.findUnique({ where: { id } });
    if (!plan || !current)
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Plan or subscription not found.",
      });
    const updated = await prisma.subscription.update({
      where: { id },
      data: { planId: plan.id, pendingPlanId: null, version: { increment: 1 } },
    });
    await prisma.subscriptionEvent.create({
      data: {
        organizationId: current.organizationId,
        subscriptionId: id,
        eventType: "PLAN_CHANGED_BY_PLATFORM",
        fromPlanId: current.planId,
        toPlanId: plan.id,
        createdBy: actorId,
        metadata: { reason: input.reason },
      },
    });
    return updated;
  }

  private async platformStatus(
    actorId: string,
    isAdmin: boolean,
    id: string,
    status: "ACTIVE" | "SUSPENDED",
    eventType: string,
    reason: string,
  ) {
    this.platform(isAdmin);
    const current = await prisma.subscription.findUniqueOrThrow({
      where: { id },
    });
    const updated = await prisma.subscription.update({
      where: { id },
      data: {
        status,
        suspendedAt: status === "SUSPENDED" ? new Date() : null,
        version: { increment: 1 },
      },
    });
    await prisma.subscriptionEvent.create({
      data: {
        organizationId: current.organizationId,
        subscriptionId: id,
        eventType,
        fromStatus: current.status,
        toStatus: status,
        createdBy: actorId,
        metadata: { reason },
      },
    });
    return updated;
  }

  private platform(value: boolean) {
    if (!value)
      throw new ForbiddenException({
        code: "PLATFORM_ACCESS_REQUIRED",
        message: "Platform administrator access is required.",
      });
  }

  private periodEnd(start: Date, interval: "MONTHLY" | "ANNUAL" | "CUSTOM") {
    const end = new Date(start);
    if (interval === "ANNUAL") end.setUTCFullYear(end.getUTCFullYear() + 1);
    else if (interval === "MONTHLY") end.setUTCMonth(end.getUTCMonth() + 1);
    else
      throw new ConflictException({
        code: "CUSTOM_INTERVAL_REQUIRES_PLATFORM",
        message: "Custom billing requires platform administration.",
      });
    return end;
  }

  private async nextBillingNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
    at: Date,
  ) {
    const year = at.getUTCFullYear();
    const sequence = await tx.billingSequence.upsert({
      where: { organizationId_year: { organizationId, year } },
      create: { organizationId, year, value: 1 },
      update: { value: { increment: 1 } },
    });
    return `BILL-${year}-${organizationId.slice(0, 8).toUpperCase()}-${String(sequence.value).padStart(6, "0")}`;
  }

  private lock(tx: Prisma.TransactionClient, id: string, scope: string) {
    return tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${id}:${scope}`}, 0))::text AS locked`;
  }

  private event(
    tx: Prisma.TransactionClient,
    subscription: {
      id: string;
      organizationId: string;
      planId: string;
      status: SubscriptionStatus;
    },
    eventType: string,
    createdBy: string,
    options: {
      toPlanId?: string;
      toStatus?: SubscriptionStatus;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    return tx.subscriptionEvent.create({
      data: {
        organizationId: subscription.organizationId,
        subscriptionId: subscription.id,
        eventType,
        fromPlanId: subscription.planId,
        toPlanId: options.toPlanId,
        fromStatus: subscription.status,
        toStatus: options.toStatus,
        metadata: options.metadata,
        createdBy,
      },
    });
  }
}
