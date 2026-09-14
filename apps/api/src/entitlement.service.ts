import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Prisma, prisma } from "@allshops/database";

export const FEATURE_CODES = {
  appointments: "appointments",
  commissions: "commissions",
  offline: "offline_pos",
  exports: "exports",
  credit: "customer_credit",
  multiBranch: "multi_branch",
} as const;

type Db = Prisma.TransactionClient | typeof prisma;
type LimitCode = "branches.max" | "users.max" | "devices.max" | "products.max";

@Injectable()
export class EntitlementService {
  async resolve(organizationId: string, now = new Date()) {
    await this.normalize(organizationId, now);
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId },
      include: {
        plan: { include: { features: true, limits: true } },
        pendingPlan: true,
      },
    });
    if (!subscription)
      throw new ForbiddenException({
        code: "SUBSCRIPTION_REQUIRED",
        message: "This organization has no subscription entitlement.",
      });
    const features = Object.fromEntries(
      subscription.plan.features.map((row) => [row.featureCode, row.enabled]),
    );
    const limits = Object.fromEntries(
      subscription.plan.limits.map((row) => [row.limitCode, row.value]),
    ) as Record<string, number | null>;
    return { subscription, plan: subscription.plan, features, limits };
  }

  async normalize(organizationId: string, now = new Date()) {
    await prisma.$transaction(async (tx) => {
      await this.lock(tx, organizationId, "subscription.lifecycle");
      const current = await tx.subscription.findUnique({
        where: { organizationId },
      });
      if (!current) return;
      if (
        current.pendingPlanId &&
        current.changeEffectiveAt &&
        current.changeEffectiveAt <= now
      ) {
        const targetLimits = await tx.planLimit.findMany({
          where: { planId: current.pendingPlanId },
        });
        const blockers: Array<{
          limitCode: LimitCode;
          current: number;
          maximum: number;
        }> = [];
        for (const limit of targetLimits) {
          const limitCode = limit.limitCode as LimitCode;
          if (
            ![
              "branches.max",
              "users.max",
              "devices.max",
              "products.max",
            ].includes(limitCode)
          )
            continue;
          await this.lock(tx, organizationId, limitCode);
          const used = await this.usageCount(tx, organizationId, limitCode);
          if (limit.value !== null && used > limit.value)
            blockers.push({ limitCode, current: used, maximum: limit.value });
        }
        const targetPlanId = current.pendingPlanId;
        await tx.subscription.update({
          where: { id: current.id },
          data: blockers.length
            ? {
                pendingPlanId: null,
                changeEffectiveAt: null,
                version: { increment: 1 },
              }
            : {
                planId: targetPlanId,
                pendingPlanId: null,
                changeEffectiveAt: null,
                version: { increment: 1 },
              },
        });
        await tx.subscriptionEvent.create({
          data: {
            organizationId,
            subscriptionId: current.id,
            eventType: blockers.length
              ? "PLAN_DOWNGRADE_BLOCKED"
              : "PLAN_DOWNGRADE_APPLIED",
            fromPlanId: current.planId,
            toPlanId: targetPlanId,
            metadata: blockers.length ? { blockers } : undefined,
            occurredAt: now,
          },
        });
      }
      let status = current.status;
      let eventType: string | null = null;
      let graceEndsAt = current.graceEndsAt;
      if (
        status === "TRIALING" &&
        current.trialEndsAt &&
        current.trialEndsAt <= now
      ) {
        status = "EXPIRED";
        eventType = "TRIAL_EXPIRED";
      } else if (
        ["ACTIVE", "CANCELLED"].includes(status) &&
        current.currentPeriodEnd &&
        current.currentPeriodEnd <= now
      ) {
        if (current.cancelAtPeriodEnd || status === "CANCELLED") {
          status = "EXPIRED";
          eventType = "SUBSCRIPTION_EXPIRED";
        } else {
          status = "PAST_DUE";
          graceEndsAt = new Date(
            current.currentPeriodEnd.getTime() +
              this.positive("SUBSCRIPTION_GRACE_DAYS", 7) * 86_400_000,
          );
          eventType = "SUBSCRIPTION_PAST_DUE";
        }
      } else if (status === "PAST_DUE") {
        status = "GRACE_PERIOD";
        eventType = "SUBSCRIPTION_GRACE_STARTED";
      } else if (
        status === "GRACE_PERIOD" &&
        graceEndsAt &&
        graceEndsAt <= now
      ) {
        status = "SUSPENDED";
        eventType = "SUBSCRIPTION_SUSPENDED";
      }
      if (!eventType || status === current.status) return;
      await tx.subscription.update({
        where: { id: current.id },
        data: {
          status,
          graceEndsAt,
          ...(status === "SUSPENDED" ? { suspendedAt: now } : {}),
          version: { increment: 1 },
        },
      });
      await tx.subscriptionEvent.create({
        data: {
          organizationId,
          subscriptionId: current.id,
          eventType,
          fromStatus: current.status,
          toStatus: status,
          occurredAt: now,
        },
      });
    });
  }

  async assertOperational(organizationId: string) {
    const { subscription } = await this.resolve(organizationId);
    if (
      !["TRIALING", "ACTIVE", "PAST_DUE", "GRACE_PERIOD", "CANCELLED"].includes(
        subscription.status,
      )
    )
      throw new ForbiddenException({
        code:
          subscription.status === "SUSPENDED"
            ? "SUBSCRIPTION_SUSPENDED"
            : "SUBSCRIPTION_INACTIVE",
        message:
          "Subscription restrictions prevent new transactions. Billing remains accessible.",
      });
    return subscription;
  }

  async assertFeature(organizationId: string, feature: string) {
    const entitlement = await this.resolve(organizationId);
    if (!entitlement.features[feature])
      throw new ForbiddenException({
        code: "FEATURE_NOT_INCLUDED",
        message: `${feature.replaceAll("_", " ")} is not included in your current plan.`,
        feature,
        upgradeRequired: true,
      });
    return entitlement;
  }

  async assertWithinLimit(
    tx: Prisma.TransactionClient,
    organizationId: string,
    limitCode: LimitCode,
  ) {
    await this.lock(tx, organizationId, limitCode);
    const subscription = await tx.subscription.findUnique({
      where: { organizationId },
      include: { plan: { include: { limits: true } } },
    });
    if (!subscription)
      throw new ForbiddenException({
        code: "SUBSCRIPTION_REQUIRED",
        message: "Subscription required.",
      });
    const maximum =
      subscription.plan.limits.find((row) => row.limitCode === limitCode)
        ?.value ?? null;
    if (maximum === null) return;
    const current = await this.usageCount(tx, organizationId, limitCode);
    if (current >= maximum)
      throw new ConflictException({
        code: "PLAN_LIMIT_REACHED",
        message: `Your current plan supports up to ${maximum} ${limitCode.split(".")[0]}.`,
        limitCode,
        current,
        maximum,
      });
  }

  async usage(organizationId: string) {
    const entitlement = await this.resolve(organizationId);
    const codes: LimitCode[] = [
      "branches.max",
      "users.max",
      "devices.max",
      "products.max",
    ];
    const values = await Promise.all(
      codes.map(async (code) => ({
        code,
        current: await this.usageCount(prisma, organizationId, code),
        maximum: entitlement.limits[code] ?? null,
      })),
    );
    return Object.fromEntries(
      values.map(({ code, current, maximum }) => [
        code.split(".")[0],
        {
          current,
          maximum,
          percentage: maximum ? Math.round((current / maximum) * 100) : null,
        },
      ]),
    );
  }

  private usageCount(db: Db, organizationId: string, code: LimitCode) {
    if (code === "branches.max")
      return db.branch.count({ where: { organizationId, isActive: true } });
    if (code === "devices.max")
      return db.device.count({ where: { organizationId, status: "ACTIVE" } });
    if (code === "products.max")
      return db.product.count({ where: { organizationId, isActive: true } });
    return db.organizationUser.count({
      where: { organizationId, status: { in: ["ACTIVE", "INVITED"] } },
    });
  }

  private lock(
    tx: Prisma.TransactionClient,
    organizationId: string,
    scope: string,
  ) {
    return tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${organizationId}:${scope}`}, 0))::text AS locked`;
  }

  positive(name: string, fallback: number) {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isFinite(value) || value <= 0)
      throw new Error(`${name} must be a positive number.`);
    return value;
  }
}
