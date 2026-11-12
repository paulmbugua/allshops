import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { Redis } from "ioredis";
import { Prisma, prisma } from "@allshops/database";
import { createServer, type Server } from "node:http";
import { decryptEtimsSecret } from "./etims-crypto.js";

@Injectable()
export class WorkerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(WorkerService.name);
  private readonly redis = new Redis(process.env.REDIS_URL!, {
    lazyConnect: true,
    keyPrefix: process.env.REDIS_KEY_PREFIX ?? "allshops:",
  });
  private timer?: NodeJS.Timeout;
  private fiscalTimer?: NodeJS.Timeout;
  private healthServer?: Server;
  private running = false;
  private ready = false;
  private lastError?: string;

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log("Connecting to Redis");
    await this.redis.connect();
    await this.redis.ping();
    await this.runLifecycleJob();
    await this.runFiscalJob();
    this.ready = true;
    this.startHealthServer();
    this.timer = setInterval(
      () => void this.runLifecycleJob(),
      Number(process.env.SUBSCRIPTION_JOB_INTERVAL_MINUTES ?? 60) * 60_000,
    );
    this.timer.unref();
    this.fiscalTimer = setInterval(
      () => void this.runFiscalJob(),
      Number(process.env.ETIMS_SUBMISSION_INTERVAL_SECONDS ?? 15) * 1_000,
    );
    this.fiscalTimer.unref();
    this.logger.log(
      "Worker ready; subscription lifecycle normalization enabled",
    );
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    if (this.fiscalTimer) clearInterval(this.fiscalTimer);
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
            checks: { redis, jobs: this.lastError ? "degraded" : "up" },
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

  private fiscalRunning = false;

  private async runFiscalJob(): Promise<void> {
    if (this.fiscalRunning) return;
    this.fiscalRunning = true;
    try {
      await this.releaseStaleFiscalLocks();
      const candidates = await prisma.fiscalOutbox.findMany({
        where: {
          status: { in: ["PENDING", "RETRY"] },
          nextAttemptAt: { lte: new Date() },
        },
        orderBy: { createdAt: "asc" },
        take: Number(process.env.WORKER_CONCURRENCY ?? 5),
        select: { id: true },
      });
      await Promise.all(
        candidates.map((row) => this.processFiscalOutbox(row.id)),
      );
      this.lastError = undefined;
    } catch (error) {
      this.lastError =
        error instanceof Error ? error.message : "Unknown fiscal job error";
      this.logger.error(
        "eTIMS fiscal outbox run failed",
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.fiscalRunning = false;
    }
  }

  private async releaseStaleFiscalLocks() {
    const stale = new Date(Date.now() - 5 * 60_000);
    await prisma.$transaction(async (tx) => {
      const rows = await tx.fiscalOutbox.findMany({
        where: { status: "PROCESSING", lockedAt: { lt: stale } },
        select: { id: true, documentId: true },
      });
      if (!rows.length) return;
      await tx.fiscalOutbox.updateMany({
        where: { id: { in: rows.map((row) => row.id) } },
        data: {
          status: "RETRY",
          lockedAt: null,
          nextAttemptAt: new Date(),
          lastError: "Recovered stale worker lock.",
        },
      });
      await tx.fiscalDocument.updateMany({
        where: {
          id: { in: rows.map((row) => row.documentId) },
          status: "SUBMITTING",
        },
        data: { status: "RETRY", errorMessage: "Recovered stale worker lock." },
      });
    });
  }

  private async processFiscalOutbox(outboxId: string) {
    const claimed = await prisma.$transaction(async (tx) => {
      const result = await tx.fiscalOutbox.updateMany({
        where: {
          id: outboxId,
          status: { in: ["PENDING", "RETRY"] },
          nextAttemptAt: { lte: new Date() },
        },
        data: {
          status: "PROCESSING",
          lockedAt: new Date(),
          attemptCount: { increment: 1 },
        },
      });
      if (result.count !== 1) return null;
      const row = await tx.fiscalOutbox.findUnique({
        where: { id: outboxId },
        include: {
          document: {
            include: {
              branch: { include: { etimsConfig: true } },
              organization: { include: { etimsIntegration: true } },
              refund: {
                include: { sale: { include: { fiscalDocument: true } } },
              },
            },
          },
        },
      });
      if (row) {
        await tx.fiscalDocument.update({
          where: { id: row.documentId },
          data: {
            status: "SUBMITTING",
            submittedAt: new Date(),
            errorCode: null,
            errorMessage: null,
          },
        });
      }
      return row;
    });
    if (!claimed) return;
    try {
      const document = claimed.document;
      const integration = document.organization.etimsIntegration;
      const branch = document.branch.etimsConfig;
      if (
        !integration ||
        !branch?.isActive ||
        !integration.communicationKeyCiphertext ||
        !integration.communicationKeyIv ||
        !integration.communicationKeyTag
      ) {
        throw new Error(
          "eTIMS integration credentials or branch configuration are unavailable.",
        );
      }
      const payload = JSON.parse(
        JSON.stringify(document.requestJson),
      ) as Record<string, unknown>;
      if (document.type === "CREDIT_NOTE") {
        const original = document.refund?.sale.fiscalDocument;
        if (
          !original ||
          original.status !== "ACCEPTED" ||
          !original.currentReceiptNumber
        )
          throw new Error(
            "Original eTIMS sale is not accepted yet; credit note deferred.",
          );
        payload.orgInvcNo = Number(original.currentReceiptNumber);
      }
      payload.cmcKey = decryptEtimsSecret({
        ciphertext: integration.communicationKeyCiphertext,
        iv: integration.communicationKeyIv,
        tag: integration.communicationKeyTag,
      });
      const baseUrl =
        document.environment === "PRODUCTION"
          ? process.env.ETIMS_PRODUCTION_BASE_URL!
          : process.env.ETIMS_SANDBOX_BASE_URL!;
      const response = await fetch(
        `${baseUrl.replace(/\/$/, "")}/saveTrnsSalesOsdc`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (!response.ok) throw new Error(`KRA eTIMS HTTP ${response.status}.`);
      const body = (await response.json()) as {
        resultCd?: string;
        resultMsg?: string;
        data?: {
          curRcptNo?: string | number;
          totRcptNo?: string | number;
          intrlData?: string;
          rcptSign?: string;
          sdcDateTime?: string;
        };
      };
      if (body.resultCd !== "000") {
        await this.rejectFiscalDocument(
          claimed,
          body.resultCd ?? "KRA_REJECTED",
          body.resultMsg ?? "KRA rejected the fiscal document.",
          body,
        );
        return;
      }
      await prisma.$transaction(async (tx) => {
        await tx.fiscalDocument.update({
          where: { id: document.id },
          data: {
            status: "ACCEPTED",
            responseJson: body as Prisma.InputJsonValue,
            currentReceiptNumber: String(body.data?.curRcptNo ?? ""),
            totalReceiptNumber: String(body.data?.totRcptNo ?? ""),
            internalData: body.data?.intrlData,
            receiptSignature: body.data?.rcptSign,
            controlUnitDateTime: body.data?.sdcDateTime,
            acceptedAt: new Date(),
          },
        });
        await tx.fiscalOutbox.update({
          where: { id: claimed.id },
          data: { status: "SUCCEEDED", lockedAt: null, lastError: null },
        });
        if (document.saleId)
          await tx.sale.update({
            where: { id: document.saleId },
            data: { fiscalStatus: "ACCEPTED" },
          });
        if (document.refundId)
          await tx.saleRefund.update({
            where: { id: document.refundId },
            data: { fiscalStatus: "ACCEPTED" },
          });
        await tx.etimsIntegration.update({
          where: { organizationId: document.organizationId },
          data: {
            lastSuccessfulSubmissionAt: new Date(),
            lastFailureAt: null,
            lastFailureCode: null,
            lastFailureMessage: null,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: document.organizationId,
            action: "ETIMS_DOCUMENT_ACCEPTED",
            entityType: "FiscalDocument",
            entityId: document.id,
            afterJson: {
              resultCode: body.resultCd,
              currentReceiptNumber: body.data?.curRcptNo,
              environment: document.environment,
            },
          },
        });
        await tx.operationalAlert.updateMany({
          where: {
            organizationId: document.organizationId,
            dedupeKey: `ETIMS:${document.id}`,
            status: { in: ["OPEN", "ACKNOWLEDGED"] },
          },
          data: { status: "RESOLVED", resolvedAt: new Date() },
        });
      });
    } catch (error) {
      await this.retryFiscalDocument(
        claimed,
        error instanceof Error
          ? error.message
          : "Unknown eTIMS submission failure",
      );
    }
  }

  private async rejectFiscalDocument(
    outbox: {
      id: string;
      documentId: string;
      document: {
        id: string;
        saleId: string | null;
        refundId: string | null;
        organizationId: string;
      };
    },
    code: string,
    message: string,
    response: unknown,
  ) {
    await prisma.$transaction(async (tx) => {
      await tx.fiscalDocument.update({
        where: { id: outbox.documentId },
        data: {
          status: "REJECTED",
          responseJson: response as Prisma.InputJsonValue,
          errorCode: code,
          errorMessage: message,
        },
      });
      await tx.fiscalOutbox.update({
        where: { id: outbox.id },
        data: {
          status: "DEAD_LETTER",
          lockedAt: null,
          lastError: `${code}: ${message}`,
        },
      });
      if (outbox.document.saleId)
        await tx.sale.update({
          where: { id: outbox.document.saleId },
          data: { fiscalStatus: "REJECTED" },
        });
      if (outbox.document.refundId)
        await tx.saleRefund.update({
          where: { id: outbox.document.refundId },
          data: { fiscalStatus: "REJECTED" },
        });
      await tx.etimsIntegration.update({
        where: { organizationId: outbox.document.organizationId },
        data: {
          lastFailureAt: new Date(),
          lastFailureCode: code,
          lastFailureMessage: message,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: outbox.document.organizationId,
          action: "ETIMS_DOCUMENT_REJECTED",
          entityType: "FiscalDocument",
          entityId: outbox.documentId,
          afterJson: { code, message },
        },
      });
      await tx.operationalAlert.upsert({
        where: {
          organizationId_dedupeKey: {
            organizationId: outbox.document.organizationId,
            dedupeKey: `ETIMS:${outbox.documentId}`,
          },
        },
        create: {
          organizationId: outbox.document.organizationId,
          type: "ETIMS_REJECTED",
          severity: "HIGH",
          title: "KRA eTIMS document rejected",
          message: `${code}: ${message}`,
          entityType: "FiscalDocument",
          entityId: outbox.documentId,
          dedupeKey: `ETIMS:${outbox.documentId}`,
        },
        update: {
          status: "OPEN",
          severity: "HIGH",
          title: "KRA eTIMS document rejected",
          message: `${code}: ${message}`,
          resolvedAt: null,
        },
      });
    });
  }

  private async retryFiscalDocument(
    outbox: {
      id: string;
      documentId: string;
      attemptCount: number;
      document: {
        id: string;
        saleId: string | null;
        refundId: string | null;
        organizationId: string;
      };
    },
    message: string,
  ) {
    const maxAttempts = Number(process.env.ETIMS_MAX_ATTEMPTS ?? 10);
    const dead = outbox.attemptCount >= maxAttempts;
    const delaySeconds = Math.min(
      3600,
      15 * 2 ** Math.min(outbox.attemptCount, 8),
    );
    await prisma.$transaction(async (tx) => {
      await tx.fiscalDocument.update({
        where: { id: outbox.documentId },
        data: {
          status: dead ? "REJECTED" : "RETRY",
          errorCode: dead ? "RETRY_EXHAUSTED" : "DELIVERY_FAILED",
          errorMessage: message,
        },
      });
      await tx.fiscalOutbox.update({
        where: { id: outbox.id },
        data: {
          status: dead ? "DEAD_LETTER" : "RETRY",
          lockedAt: null,
          lastError: message,
          nextAttemptAt: new Date(Date.now() + delaySeconds * 1_000),
        },
      });
      const status = dead ? "REJECTED" : "RETRY";
      if (outbox.document.saleId)
        await tx.sale.update({
          where: { id: outbox.document.saleId },
          data: { fiscalStatus: status },
        });
      if (outbox.document.refundId)
        await tx.saleRefund.update({
          where: { id: outbox.document.refundId },
          data: { fiscalStatus: status },
        });
      await tx.etimsIntegration.update({
        where: { organizationId: outbox.document.organizationId },
        data: {
          lastFailureAt: new Date(),
          lastFailureCode: dead ? "RETRY_EXHAUSTED" : "DELIVERY_FAILED",
          lastFailureMessage: message,
        },
      });
      if (dead)
        await tx.operationalAlert.upsert({
          where: {
            organizationId_dedupeKey: {
              organizationId: outbox.document.organizationId,
              dedupeKey: `ETIMS:${outbox.documentId}`,
            },
          },
          create: {
            organizationId: outbox.document.organizationId,
            type: "ETIMS_DELIVERY_EXHAUSTED",
            severity: "CRITICAL",
            title: "KRA eTIMS delivery requires attention",
            message,
            entityType: "FiscalDocument",
            entityId: outbox.documentId,
            dedupeKey: `ETIMS:${outbox.documentId}`,
          },
          update: {
            status: "OPEN",
            severity: "CRITICAL",
            title: "KRA eTIMS delivery requires attention",
            message,
            resolvedAt: null,
          },
        });
    });
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
