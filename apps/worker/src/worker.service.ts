import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { Redis } from "ioredis";
import { prisma } from "@allshops/database";
import { createServer, type Server } from "node:http";

@Injectable()
export class WorkerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(WorkerService.name);
  private readonly redis = new Redis(process.env.REDIS_URL!, {
    lazyConnect: true,
  });
  private timer?: NodeJS.Timeout;
  private healthServer?: Server;
  private running = false;
  private ready = false;
  private lastError?: string;

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log("Connecting to Redis");
    await this.redis.connect();
    await this.redis.ping();
    await this.runLifecycleJob();
    this.ready = true;
    this.startHealthServer();
    this.timer = setInterval(
      () => void this.runLifecycleJob(),
      Number(process.env.SUBSCRIPTION_JOB_INTERVAL_MINUTES ?? 60) * 60_000,
    );
    this.timer.unref();
    this.logger.log(
      "Worker ready; subscription lifecycle normalization enabled",
    );
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.ready = false;
    await new Promise<void>((resolve) => {
      if (!this.healthServer) return resolve();
      this.healthServer.close(() => resolve());
    });
    this.logger.log("Closing Redis connection");
    await Promise.allSettled([this.redis.quit(), prisma.$disconnect()]);
  }

  private startHealthServer(): void {
    this.healthServer = createServer(async (request, response) => {
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      if (request.url === "/health/live") {
        response.end(
          JSON.stringify({ status: "ok", service: "allshops-worker" }),
        );
        return;
      }
      if (request.url === "/health/ready") {
        let redis = "down";
        try {
          redis = (await this.redis.ping()) === "PONG" ? "up" : "down";
        } catch {
          redis = "down";
        }
        const ready = this.ready && redis === "up";
        response.statusCode = ready ? 200 : 503;
        response.end(
          JSON.stringify({
            status: ready ? "ok" : "unavailable",
            service: "allshops-worker",
            checks: { redis, lifecycle: this.lastError ? "degraded" : "up" },
          }),
        );
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ status: "not_found" }));
    });
    this.healthServer.listen(
      Number(process.env.WORKER_HEALTH_PORT ?? 4001),
      "0.0.0.0",
    );
  }

  private async runLifecycleJob(): Promise<void> {
    if (this.running) {
      this.logger.warn(
        "Subscription lifecycle run skipped because the previous run is active",
      );
      return;
    }
    this.running = true;
    try {
      await this.normalizeSubscriptions();
      this.lastError = undefined;
    } catch (error) {
      this.lastError =
        error instanceof Error ? error.message : "Unknown lifecycle error";
      this.logger.error(
        "Subscription lifecycle normalization failed",
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  async normalizeSubscriptions(now = new Date()) {
    const rows = await prisma.subscription.findMany({
      where: {
        OR: [
          { status: "TRIALING", trialEndsAt: { lte: now } },
          {
            status: { in: ["ACTIVE", "CANCELLED"] },
            currentPeriodEnd: { lte: now },
          },
          { status: "PAST_DUE" },
          { status: "GRACE_PERIOD", graceEndsAt: { lte: now } },
          { pendingPlanId: { not: null }, changeEffectiveAt: { lte: now } },
        ],
      },
      select: { organizationId: true },
    });
    for (const row of rows) {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${row.organizationId}:subscription.lifecycle`}, 0))::text AS locked`;
        const current = await tx.subscription.findUnique({
          where: { organizationId: row.organizationId },
        });
        if (!current) return;
        if (
          current.pendingPlanId &&
          current.changeEffectiveAt &&
          current.changeEffectiveAt <= now
        ) {
          const limits = await tx.planLimit.findMany({
            where: { planId: current.pendingPlanId },
          });
          const blockers: Array<{
            limitCode: string;
            current: number;
            maximum: number;
          }> = [];
          for (const limit of limits) {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${row.organizationId}:${limit.limitCode}`}, 0))::text AS locked`;
            let used = 0;
            if (limit.limitCode === "branches.max")
              used = await tx.branch.count({
                where: { organizationId: row.organizationId, isActive: true },
              });
            else if (limit.limitCode === "devices.max")
              used = await tx.device.count({
                where: { organizationId: row.organizationId, status: "ACTIVE" },
              });
            else if (limit.limitCode === "products.max")
              used = await tx.product.count({
                where: { organizationId: row.organizationId, isActive: true },
              });
            else if (limit.limitCode === "users.max")
              used = await tx.organizationUser.count({
                where: {
                  organizationId: row.organizationId,
                  status: { in: ["ACTIVE", "INVITED"] },
                },
              });
            else continue;
            if (limit.value !== null && used > limit.value)
              blockers.push({
                limitCode: limit.limitCode,
                current: used,
                maximum: limit.value,
              });
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
              organizationId: current.organizationId,
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
                Number(process.env.SUBSCRIPTION_GRACE_DAYS ?? 7) * 86_400_000,
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
          data: { status, graceEndsAt, version: { increment: 1 } },
        });
        await tx.subscriptionEvent.create({
          data: {
            organizationId: current.organizationId,
            subscriptionId: current.id,
            eventType,
            fromStatus: current.status,
            toStatus: status,
            occurredAt: now,
          },
        });
      });
    }
  }
}
