import { createHash } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, prisma } from "@allshops/database";
import type {
  ConflictResolutionInput,
  OfflineSalePayloadV1,
  RegisterDeviceInput,
  RenameDeviceInput,
  SyncListInput,
  SyncSalesBatchInput,
} from "@allshops/contracts";
import { offlineSalePayloadV1Schema } from "@allshops/contracts";
import { SalesService } from "./sales.service.js";
import { EntitlementService } from "./entitlement.service.js";
import type { TenantContext } from "./security.types.js";

const json = <T>(value: T): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
type SyncResult = {
  transactionUuid: string;
  status: "SYNCED" | "CONFLICT" | "REJECTED";
  saleId?: string | null;
  invoiceNumber?: string | null;
  pricePolicy?: "LOCAL_PRICE_HONORED" | "CURRENT_PRICE_MATCHED";
  code?: string;
  message?: string;
};

@Injectable()
export class SyncService {
  private readonly priceMaxAgeMs =
    (Number.parseInt(process.env.OFFLINE_PRICE_MAX_AGE_HOURS ?? "72", 10) ||
      72) * 3_600_000;
  private readonly clockSkewMs =
    (Number.parseInt(process.env.OFFLINE_CLOCK_SKEW_HOURS ?? "24", 10) || 24) *
    3_600_000;
  private readonly offlineSessionMaxMs =
    (Number.parseInt(process.env.OFFLINE_SESSION_MAX_HOURS ?? "24", 10) || 24) *
    3_600_000;

  constructor(
    private readonly sales: SalesService,
    private readonly entitlements: EntitlementService,
  ) {}

  async registerDevice(
    tenant: TenantContext,
    userId: string,
    input: RegisterDeviceInput,
  ) {
    this.assertBranch(tenant, input.branchId);
    const branch = await prisma.branch.findFirst({
      where: {
        id: input.branchId,
        organizationId: tenant.organizationId,
        isActive: true,
      },
    });
    if (!branch)
      throw this.notFound("BRANCH_INACTIVE", "Active branch not found.");
    const existing = await prisma.device.findUnique({
      where: { deviceUuid: input.deviceIdentifier },
    });
    if (existing && existing.organizationId !== tenant.organizationId)
      throw new ForbiddenException({
        code: "DEVICE_IDENTIFIER_IN_USE",
        message: "Device identifier belongs to another organization.",
      });
    if (
      existing?.status === "REVOKED" &&
      !tenant.permissions.includes("device.manage")
    )
      throw new ForbiddenException({
        code: "DEVICE_REVOKED",
        message: "Only a device manager can reactivate this device.",
      });
    const device = await prisma.$transaction(async (tx) => {
      if (!existing || existing.status === "REVOKED")
        await this.entitlements.assertWithinLimit(
          tx,
          tenant.organizationId,
          "devices.max",
        );
      return existing
        ? tx.device.update({
            where: { id: existing.id },
            data: {
              branchId: input.branchId,
              userId,
              name: input.name,
              status: "ACTIVE",
              revokedAt: null,
              lastSeenAt: new Date(),
            },
          })
        : tx.device.create({
            data: {
              organizationId: tenant.organizationId,
              branchId: input.branchId,
              userId,
              name: input.name,
              deviceUuid: input.deviceIdentifier,
              lastSeenAt: new Date(),
            },
          });
    });
    await prisma.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        userId,
        action: "DEVICE_REGISTERED",
        entityType: "Device",
        entityId: device.id,
        afterJson: { branchId: device.branchId, name: device.name },
      },
    });
    return device;
  }

  devices(tenant: TenantContext) {
    return prisma.device.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...(tenant.branchId ? { branchId: tenant.branchId } : {}),
      },
      include: {
        branch: { select: { name: true } },
        user: { select: { name: true } },
        _count: {
          select: { offlineTransactions: { where: { status: "CONFLICT" } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async revokeDevice(tenant: TenantContext, userId: string, deviceId: string) {
    const device = await this.device(tenant, deviceId);
    const updated = await prisma.device.update({
      where: { id: device.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        userId,
        action: "DEVICE_REVOKED",
        entityType: "Device",
        entityId: device.id,
      },
    });
    return updated;
  }

  async renameDevice(
    tenant: TenantContext,
    userId: string,
    deviceId: string,
    input: RenameDeviceInput,
  ) {
    const device = await this.device(tenant, deviceId);
    const updated = await prisma.device.update({
      where: { id: device.id },
      data: { name: input.name },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        userId,
        action: "DEVICE_RENAMED",
        entityType: "Device",
        entityId: device.id,
        beforeJson: { name: device.name },
        afterJson: { name: updated.name },
      },
    });
    return updated;
  }

  async bootstrap(tenant: TenantContext, userId: string, deviceId: string) {
    const entitlement = await this.entitlements.assertFeature(
      tenant.organizationId,
      "offline_pos",
    );
    const device = await this.activeDevice(tenant, userId, deviceId);
    const branchId = device.branchId!;
    const [organization, branch, products, customers, staff] =
      await Promise.all([
        prisma.organization.findUniqueOrThrow({
          where: { id: tenant.organizationId },
          select: { id: true, name: true, currency: true, timezone: true },
        }),
        prisma.branch.findUniqueOrThrow({ where: { id: branchId } }),
        prisma.product.findMany({
          where: { organizationId: tenant.organizationId, isActive: true },
          select: {
            id: true,
            name: true,
            arabicName: true,
            sku: true,
            barcode: true,
            imageUrl: true,
            type: true,
            priceMinor: true,
            trackInventory: true,
            allowNegativeStock: true,
            updatedAt: true,
            variants: {
              where: { isActive: true },
              select: {
                id: true,
                name: true,
                sku: true,
                barcode: true,
                priceMinor: true,
                updatedAt: true,
              },
            },
            inventoryBalances: {
              where: { branchId },
              select: { variantId: true, locationId: true, quantity: true },
            },
          },
          orderBy: { name: "asc" },
          take: 5_000,
        }),
        prisma.customer.findMany({
          where: { organizationId: tenant.organizationId, isActive: true },
          select: { id: true, name: true, phone: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
          take: 500,
        }),
        prisma.staffProfile.findMany({
          where: {
            organizationId: tenant.organizationId,
            isActive: true,
            branches: { some: { branchId, isActive: true } },
          },
          select: {
            id: true,
            displayName: true,
            services: {
              where: { isActive: true },
              select: { serviceProductId: true, customPriceMinor: true },
            },
          },
        }),
      ]);
    const syncedAt = new Date();
    await prisma.device.update({
      where: { id: device.id },
      data: {
        lastSeenAt: syncedAt,
        lastSyncAt: syncedAt,
        entitlementSnapshotAt: syncedAt,
        entitlementExpiresAt: new Date(
          syncedAt.getTime() +
            (Number.parseInt(
              process.env.OFFLINE_SESSION_MAX_HOURS ?? "24",
              10,
            ) || 24) *
              3_600_000,
        ),
        offlineEntitled: true,
        entitlementStatus: entitlement.subscription.status,
      },
    });
    return {
      payloadVersion: 1,
      organization,
      branch,
      permissions: tenant.permissions.filter((permission) =>
        [
          "sale.create",
          "sale.discount",
          "payment.record",
          "sync.execute",
        ].includes(permission),
      ),
      products: products.map((product) => ({
        ...product,
        inventoryBalances: product.inventoryBalances.map((row) => ({
          ...row,
          quantity: row.quantity.toString(),
        })),
      })),
      customers,
      staff,
      cursor: syncedAt.toISOString(),
      offlineSessionExpiresAt: new Date(
        syncedAt.getTime() +
          (Number.parseInt(process.env.OFFLINE_SESSION_MAX_HOURS ?? "24", 10) ||
            24) *
            3_600_000,
      ).toISOString(),
      entitlement: {
        status: entitlement.subscription.status,
        features: Object.keys(entitlement.features).filter(
          (code) => entitlement.features[code],
        ),
        snapshotAt: syncedAt.toISOString(),
        expiresAt: new Date(
          syncedAt.getTime() +
            (Number.parseInt(
              process.env.OFFLINE_SESSION_MAX_HOURS ?? "24",
              10,
            ) || 24) *
              3_600_000,
        ).toISOString(),
      },
    };
  }

  async syncSales(
    tenant: TenantContext,
    userId: string,
    input: SyncSalesBatchInput,
  ) {
    await this.activeDevice(tenant, userId, input.deviceId);
    const results = [];
    for (const transaction of input.transactions) {
      if (transaction.deviceId !== input.deviceId) {
        results.push(
          this.conflictResult(
            transaction.transactionUuid,
            "DEVICE_MISMATCH",
            "Transaction device does not match batch device.",
          ),
        );
        continue;
      }
      results.push(await this.process(tenant, userId, transaction));
    }
    return { results };
  }

  private async process(
    tenant: TenantContext,
    userId: string,
    payload: OfflineSalePayloadV1,
    allowNegativeStockOverride = false,
  ): Promise<SyncResult> {
    const payloadHash = digest(payload);
    let record = await prisma.offlineTransaction.findUnique({
      where: {
        organizationId_transactionUuid: {
          organizationId: tenant.organizationId,
          transactionUuid: payload.transactionUuid,
        },
      },
    });
    if (record) {
      if (record.payloadHash !== payloadHash)
        return this.conflictResult(
          payload.transactionUuid,
          "IDEMPOTENCY_KEY_REUSE_MISMATCH",
          "Transaction UUID was reused with different content.",
        );
      if (record.status === "SYNCED")
        return {
          transactionUuid: payload.transactionUuid,
          status: "SYNCED" as const,
          saleId: record.saleId,
          invoiceNumber: record.invoiceNumber,
        };
      if (record.status === "REJECTED")
        return this.conflictResult(
          payload.transactionUuid,
          "REJECTED",
          "Transaction was rejected by a manager.",
          "REJECTED",
        );
      if (record.status === "CONFLICT" && !allowNegativeStockOverride)
        return this.conflictResult(
          payload.transactionUuid,
          record.conflictCode ?? "CONFLICT",
          record.conflictMessage ?? "Manager resolution is required.",
        );
    } else {
      try {
        record = await prisma.offlineTransaction.create({
          data: {
            organizationId: tenant.organizationId,
            deviceId: payload.deviceId,
            submittedBy: userId,
            transactionUuid: payload.transactionUuid,
            payloadVersion: payload.payloadVersion,
            payloadHash,
            payloadJson: json(payload),
            localReference: payload.localReference,
            clientCreatedAt: payload.clientCreatedAt,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          return this.process(
            tenant,
            userId,
            payload,
            allowNegativeStockOverride,
          );
        throw error;
      }
    }
    try {
      const device = await this.activeDevice(
        tenant,
        userId,
        payload.deviceId,
        allowNegativeStockOverride,
      );
      if (device.branchId !== payload.branchId)
        throw new ForbiddenException({
          code: "BRANCH_MISMATCH",
          message: "Device is locked to another branch.",
        });
      if (
        !device.offlineEntitled ||
        !device.entitlementExpiresAt ||
        payload.clientCreatedAt > device.entitlementExpiresAt
      )
        throw new ConflictException({
          code: "OFFLINE_ENTITLEMENT_EXPIRED",
          message:
            "The device did not hold a valid offline POS entitlement when this sale occurred.",
        });
      const now = Date.now();
      if (Math.abs(now - payload.clientCreatedAt.getTime()) > this.clockSkewMs)
        throw new ConflictException({
          code: "CLOCK_SKEW",
          message: "Offline sale clock is outside the accepted window.",
        });
      if (
        now - payload.offlineSessionIssuedAt.getTime() >
        this.offlineSessionMaxMs
      )
        throw new ConflictException({
          code: "OFFLINE_SESSION_EXPIRED",
          message: "Offline session is older than the permitted window.",
        });
      if (
        !device.lastSyncAt ||
        payload.catalogueSnapshotAt.getTime() >
          device.lastSyncAt.getTime() + 5 * 60_000
      )
        throw new ConflictException({
          code: "INVALID_CATALOGUE_SNAPSHOT",
          message: "Catalogue snapshot was not issued by the last device sync.",
        });
      if (now - payload.catalogueSnapshotAt.getTime() > this.priceMaxAgeMs)
        throw new ConflictException({
          code: "PRICE_STALE",
          message: "Catalogue price snapshot is too old.",
        });
      const checkout = {
        branchId: payload.branchId,
        deviceId: payload.deviceId,
        items: payload.items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          staffProfileId: item.staffProfileId,
          quantity: item.quantity,
        })),
        payments: payload.payments.map((payment) => ({
          method: payment.method,
          amountMinor: payment.tenderedMinor ?? payment.amountMinor,
          reference: payment.reference,
        })),
        discount: payload.discount,
        customerName: payload.customerName,
        customerPhone: payload.customerPhone,
        notes: payload.notes,
      };
      const prices = new Map(
        payload.items.map((item) => [
          `${item.productId}:${item.variantId ?? "BASE"}:${item.staffProfileId ?? "NONE"}`,
          item.priceSnapshotMinor,
        ]),
      );
      const current = await prisma.product.findMany({
        where: {
          organizationId: tenant.organizationId,
          id: { in: payload.items.map((item) => item.productId) },
        },
        include: { variants: true },
      });
      const changedPrices = payload.items.filter((item) => {
        const product = current.find((row) => row.id === item.productId);
        const variant = item.variantId
          ? product?.variants.find((row) => row.id === item.variantId)
          : null;
        return (
          (variant?.priceMinor ?? product?.priceMinor) !==
          item.priceSnapshotMinor
        );
      });
      const currentEntitlement = await this.entitlements.resolve(
        tenant.organizationId,
      );
      const sale = await this.sales.checkoutOffline(
        tenant,
        record.submittedBy,
        checkout,
        payload.transactionUuid,
        {
          priceOverrides: prices,
          allowNegativeStockOverride,
          offline: {
            transactionUuid: payload.transactionUuid,
            localReference: payload.localReference,
            clientCreatedAt: payload.clientCreatedAt,
            syncedAt: new Date(),
          },
        },
      );
      await prisma.$transaction([
        prisma.offlineTransaction.update({
          where: { id: record.id },
          data: {
            status: "SYNCED",
            saleId: sale.id,
            invoiceNumber: sale.invoiceNumber,
            conflictCode: null,
            conflictMessage: null,
          },
        }),
        prisma.device.update({
          where: { id: device.id },
          data: { lastSeenAt: new Date(), lastSyncAt: new Date() },
        }),
        ...(changedPrices.length
          ? [
              prisma.auditLog.create({
                data: {
                  organizationId: tenant.organizationId,
                  userId: record.submittedBy,
                  action: "OFFLINE_LOCAL_PRICE_USED",
                  entityType: "Sale",
                  entityId: sale.id,
                  afterJson: {
                    differences: changedPrices.map((row) => ({
                      productId: row.productId,
                      acceptedPriceMinor: row.priceSnapshotMinor,
                    })),
                  },
                },
              }),
            ]
          : []),
        ...(!currentEntitlement.features.offline_pos ||
        ["SUSPENDED", "EXPIRED"].includes(
          currentEntitlement.subscription.status,
        )
          ? [
              prisma.auditLog.create({
                data: {
                  organizationId: tenant.organizationId,
                  userId: record.submittedBy,
                  action: "OFFLINE_SALE_SYNCED_FROM_VALID_PRIOR_ENTITLEMENT",
                  entityType: "Sale",
                  entityId: sale.id,
                  afterJson: {
                    currentSubscriptionStatus:
                      currentEntitlement.subscription.status,
                    deviceEntitlementStatus: device.entitlementStatus,
                    entitlementExpiresAt: device.entitlementExpiresAt,
                  },
                },
              }),
            ]
          : []),
      ]);
      return {
        transactionUuid: payload.transactionUuid,
        status: "SYNCED" as const,
        saleId: sale.id,
        invoiceNumber: sale.invoiceNumber,
        pricePolicy: changedPrices.length
          ? "LOCAL_PRICE_HONORED"
          : "CURRENT_PRICE_MATCHED",
      };
    } catch (error) {
      const detail = this.errorDetail(error);
      await prisma.offlineTransaction.update({
        where: { id: record.id },
        data: {
          status: "CONFLICT",
          conflictCode: detail.code,
          conflictMessage: detail.message,
        },
      });
      return this.conflictResult(
        payload.transactionUuid,
        detail.code,
        detail.message,
      );
    }
  }

  async conflicts(tenant: TenantContext, input: SyncListInput) {
    this.assertBranch(tenant, input.branchId);
    const records = await prisma.offlineTransaction.findMany({
      where: {
        organizationId: tenant.organizationId,
        status: input.status ?? "CONFLICT",
        ...(input.deviceId ? { deviceId: input.deviceId } : {}),
        ...(input.conflictCode ? { conflictCode: input.conflictCode } : {}),
        ...(tenant.branchId || input.branchId
          ? { device: { branchId: tenant.branchId ?? input.branchId } }
          : {}),
      },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        device: {
          select: {
            id: true,
            name: true,
            branch: { select: { id: true, name: true } },
          },
        },
      },
    });
    const users = await prisma.user.findMany({
      where: { id: { in: records.map((record) => record.submittedBy) } },
      select: { id: true, name: true },
    });
    const names = new Map(users.map((user) => [user.id, user.name]));
    return records.map((record) => ({
      ...record,
      submitter: {
        id: record.submittedBy,
        name: names.get(record.submittedBy) ?? "Unknown user",
      },
    }));
  }

  async resolve(
    tenant: TenantContext,
    managerId: string,
    transactionUuid: string,
    input: ConflictResolutionInput,
  ) {
    const record = await prisma.offlineTransaction.findFirst({
      where: {
        organizationId: tenant.organizationId,
        transactionUuid,
        status: "CONFLICT",
      },
      include: { device: true },
    });
    if (!record)
      throw this.notFound(
        "SYNC_CONFLICT_NOT_FOUND",
        "Sync conflict not found.",
      );
    this.assertBranch(tenant, record.device.branchId ?? undefined);
    if (input.action === "REJECT") {
      await prisma.$transaction([
        prisma.offlineTransaction.update({
          where: { id: record.id },
          data: {
            status: "REJECTED",
            resolution: "REJECT",
            resolvedAt: new Date(),
          },
        }),
        prisma.auditLog.create({
          data: {
            organizationId: tenant.organizationId,
            userId: managerId,
            action: "OFFLINE_TRANSACTION_REJECTED",
            entityType: "OfflineTransaction",
            entityId: record.id,
          },
        }),
      ]);
      return {
        transactionUuid,
        status: "REJECTED",
        requiresManualCorrection: true,
      };
    }
    if (record.conflictCode !== "INSUFFICIENT_STOCK")
      throw new ConflictException({
        code: "OVERRIDE_NOT_SUPPORTED",
        message:
          "Only an insufficient-stock conflict supports negative-stock override.",
      });
    const payload = offlineSalePayloadV1Schema.parse(record.payloadJson);
    await prisma.offlineTransaction.update({
      where: { id: record.id },
      data: {
        status: "PENDING",
        resolution: "ACCEPT_OVERRIDE",
        resolvedAt: new Date(),
      },
    });
    const result = await this.process(
      tenant,
      record.submittedBy,
      payload,
      true,
    );
    await prisma.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        userId: managerId,
        action: "OFFLINE_STOCK_OVERRIDE",
        entityType: "OfflineTransaction",
        entityId: record.id,
        afterJson: { transactionUuid },
      },
    });
    return result;
  }

  async syncStatus(tenant: TenantContext, deviceId: string) {
    const device = await this.device(tenant, deviceId);
    const recent = await prisma.offlineTransaction.findMany({
      where: { organizationId: tenant.organizationId, deviceId },
      select: {
        transactionUuid: true,
        localReference: true,
        status: true,
        conflictCode: true,
        saleId: true,
        invoiceNumber: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });
    return {
      deviceId,
      lastSeenAt: device.lastSeenAt,
      lastSuccessfulSyncAt: device.lastSyncAt,
      conflictCount: recent.filter((row) => row.status === "CONFLICT").length,
      recent,
    };
  }

  private async activeDevice(
    tenant: TenantContext,
    userId: string,
    id: string,
    managerOverride = false,
  ) {
    const device = await this.device(tenant, id);
    if (device.status !== "ACTIVE")
      throw new ForbiddenException({
        code: "DEVICE_REVOKED",
        message: "Device has been revoked.",
      });
    if (!device.branchId || !device.branch?.isActive)
      throw new ConflictException({
        code: "BRANCH_INACTIVE",
        message: "Device branch is inactive.",
      });
    if (!managerOverride && device.userId && device.userId !== userId)
      throw new ForbiddenException({
        code: "DEVICE_USER_MISMATCH",
        message: "Device is registered to another user.",
      });
    return device;
  }

  private async device(tenant: TenantContext, id: string) {
    const device = await prisma.device.findFirst({
      where: {
        id,
        organizationId: tenant.organizationId,
        ...(tenant.branchId ? { branchId: tenant.branchId } : {}),
      },
      include: { branch: true },
    });
    if (!device) throw this.notFound("DEVICE_NOT_FOUND", "Device not found.");
    return device;
  }

  private assertBranch(tenant: TenantContext, branchId?: string) {
    if (tenant.branchId && branchId && tenant.branchId !== branchId)
      throw new ForbiddenException({
        code: "BRANCH_SCOPE_VIOLATION",
        message: "Branch is outside your authorized scope.",
      });
  }

  private errorDetail(error: unknown) {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === "object" && response && "code" in response)
        return {
          code: String(response.code),
          message:
            "message" in response ? String(response.message) : error.message,
        };
      return { code: "SYNC_CONFLICT", message: error.message };
    }
    return {
      code: "FAILED_RETRYABLE",
      message: "Temporary synchronization failure.",
    };
  }

  private conflictResult(
    transactionUuid: string,
    code: string,
    message: string,
    status: "CONFLICT" | "REJECTED" = "CONFLICT",
  ) {
    return { transactionUuid, status, code, message };
  }

  private notFound(code: string, message: string) {
    return new NotFoundException({ code, message });
  }
}
