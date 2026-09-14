import { createHash } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, prisma } from "@allshops/database";
import type {
  AdjustmentInput,
  CreateTransferInput,
  InventoryFilterInput,
  MovementFilterInput,
  OpeningStockInput,
  TransferListInput,
} from "@allshops/contracts";
import type { TenantContext } from "./security.types.js";

type Transaction = Prisma.TransactionClient;
type MovementInput = {
  branchId: string;
  locationId: string;
  productId: string;
  variantId?: string | null;
  quantity: Prisma.Decimal;
  movementType:
    | "OPENING"
    | "ADJUSTMENT_IN"
    | "ADJUSTMENT_OUT"
    | "TRANSFER_IN"
    | "TRANSFER_OUT"
    | "SALE"
    | "PURCHASE";
  unitCostMinor?: number | null;
  referenceType?: string;
  referenceId?: string;
  reason?: string;
  userId: string;
  allowInactiveProduct?: boolean;
  allowNegativeOverride?: boolean;
};

const jsonValue = <T>(value: T): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const bucketKey = (productId: string, variantId?: string | null) =>
  `${productId}:${variantId ?? "BASE"}`;

@Injectable()
export class InventoryService {
  postPurchaseMovement(
    tx: Transaction,
    tenant: TenantContext,
    input: {
      branchId: string;
      locationId: string;
      productId: string;
      variantId?: string | null;
      quantity: Prisma.Decimal;
      unitCostMinor: number;
      purchaseId: string;
      purchaseItemId: string;
      userId: string;
    },
  ) {
    return this.writeMovement(tx, tenant, {
      branchId: input.branchId,
      locationId: input.locationId,
      productId: input.productId,
      variantId: input.variantId,
      quantity: input.quantity,
      movementType: "PURCHASE",
      unitCostMinor: input.unitCostMinor,
      referenceType: "PURCHASE",
      referenceId: input.purchaseId,
      reason: `Purchase item ${input.purchaseItemId}`,
      userId: input.userId,
      allowInactiveProduct: true,
    });
  }

  postSaleMovement(
    tx: Transaction,
    tenant: TenantContext,
    input: {
      branchId: string;
      locationId: string;
      productId: string;
      variantId?: string | null;
      quantity: Prisma.Decimal;
      unitCostMinor: number;
      saleId: string;
      saleItemId: string;
      userId: string;
      allowNegativeOverride?: boolean;
    },
  ) {
    return this.writeMovement(tx, tenant, {
      branchId: input.branchId,
      locationId: input.locationId,
      productId: input.productId,
      variantId: input.variantId,
      quantity: input.quantity.neg(),
      movementType: "SALE",
      unitCostMinor: input.unitCostMinor,
      referenceType: "SALE",
      referenceId: input.saleId,
      reason: `Sale item ${input.saleItemId}`,
      userId: input.userId,
      allowNegativeOverride: input.allowNegativeOverride,
    });
  }

  locations(tenant: TenantContext, branchId?: string) {
    this.assertBranchScope(tenant, branchId);
    return prisma.stockLocation.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...(tenant.branchId
          ? { branchId: tenant.branchId }
          : branchId
            ? { branchId }
            : {}),
      },
      include: { branch: { select: { id: true, name: true, code: true } } },
      orderBy: [{ branchId: "asc" }, { isDefault: "desc" }, { name: "asc" }],
    });
  }

  async balances(tenant: TenantContext, input: InventoryFilterInput) {
    this.assertBranchScope(tenant, input.branchId);
    const where: Prisma.InventoryBalanceWhereInput = {
      organizationId: tenant.organizationId,
      ...(tenant.branchId
        ? { branchId: tenant.branchId }
        : input.branchId
          ? { branchId: input.branchId }
          : {}),
      ...(input.locationId ? { locationId: input.locationId } : {}),
      ...(input.productId ? { productId: input.productId } : {}),
      ...(input.variantId ? { variantId: input.variantId } : {}),
    };
    const include = {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          minimumStock: true,
          isActive: true,
        },
      },
      variant: { select: { id: true, name: true, sku: true, isActive: true } },
      branch: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
    } as const;
    if (input.lowStock !== undefined) {
      const all = await prisma.inventoryBalance.findMany({
        where,
        include,
        orderBy: [{ product: { name: "asc" } }, { branch: { name: "asc" } }],
      });
      const filtered = all.filter((item) => {
        const low =
          item.product.minimumStock !== null &&
          item.quantity.lte(item.product.minimumStock);
        return input.lowStock ? low : !low;
      });
      const start = (input.page - 1) * input.pageSize;
      return {
        items: filtered
          .slice(start, start + input.pageSize)
          .map(this.balanceView),
        page: input.page,
        pageSize: input.pageSize,
        total: filtered.length,
      };
    }
    const [items, total] = await prisma.$transaction([
      prisma.inventoryBalance.findMany({
        where,
        include,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        orderBy: [{ product: { name: "asc" } }, { branch: { name: "asc" } }],
      }),
      prisma.inventoryBalance.count({ where }),
    ]);
    return {
      items: items.map(this.balanceView),
      page: input.page,
      pageSize: input.pageSize,
      total,
    };
  }

  async movements(tenant: TenantContext, input: MovementFilterInput) {
    this.assertBranchScope(tenant, input.branchId);
    const where: Prisma.StockMovementWhereInput = {
      organizationId: tenant.organizationId,
      ...(tenant.branchId
        ? { branchId: tenant.branchId }
        : input.branchId
          ? { branchId: input.branchId }
          : {}),
      ...(input.locationId ? { locationId: input.locationId } : {}),
      ...(input.productId ? { productId: input.productId } : {}),
      ...(input.variantId ? { variantId: input.variantId } : {}),
      ...(input.movementType ? { movementType: input.movementType } : {}),
      ...(input.dateFrom || input.dateTo
        ? {
            occurredAt: {
              ...(input.dateFrom ? { gte: input.dateFrom } : {}),
              ...(input.dateTo ? { lte: input.dateTo } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.stockMovement.findMany({
        where,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        include: {
          product: { select: { id: true, name: true, sku: true } },
          variant: { select: { id: true, name: true, sku: true } },
          branch: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true } },
        },
      }),
      prisma.stockMovement.count({ where }),
    ]);
    return { items, page: input.page, pageSize: input.pageSize, total };
  }

  opening(
    tenant: TenantContext,
    userId: string,
    input: OpeningStockInput,
    idempotencyKey?: string,
  ) {
    return this.idempotent(
      tenant.organizationId,
      "inventory.opening",
      idempotencyKey,
      input,
      async (tx) => {
        const movement = await this.writeMovement(tx, tenant, {
          ...input,
          quantity: new Prisma.Decimal(input.quantity),
          movementType: "OPENING",
          userId,
        });
        await this.audit(
          tx,
          tenant.organizationId,
          userId,
          "OPENING_STOCK_POSTED",
          "StockMovement",
          movement.id,
          {
            branchId: input.branchId,
            productId: input.productId,
            quantity: input.quantity,
          },
        );
        return movement;
      },
    );
  }

  adjustment(
    tenant: TenantContext,
    userId: string,
    input: AdjustmentInput,
    idempotencyKey?: string,
  ) {
    return this.idempotent(
      tenant.organizationId,
      "inventory.adjustment",
      idempotencyKey,
      input,
      async (tx) => {
        const quantity = new Prisma.Decimal(input.quantity).mul(
          input.direction === "OUT" ? -1 : 1,
        );
        const movement = await this.writeMovement(tx, tenant, {
          ...input,
          quantity,
          movementType:
            input.direction === "OUT" ? "ADJUSTMENT_OUT" : "ADJUSTMENT_IN",
          userId,
        });
        await this.audit(
          tx,
          tenant.organizationId,
          userId,
          "STOCK_ADJUSTED",
          "StockMovement",
          movement.id,
          {
            branchId: input.branchId,
            productId: input.productId,
            direction: input.direction,
            quantity: input.quantity,
            reason: input.reason,
          },
        );
        return movement;
      },
    );
  }

  async transfers(tenant: TenantContext, input: TransferListInput) {
    const where: Prisma.StockTransferWhereInput = {
      organizationId: tenant.organizationId,
      ...(input.status ? { status: input.status } : {}),
      ...(tenant.branchId
        ? {
            OR: [
              { fromBranchId: tenant.branchId },
              { toBranchId: tenant.branchId },
            ],
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.stockTransfer.findMany({
        where,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          fromBranch: { select: { id: true, name: true } },
          toBranch: { select: { id: true, name: true } },
          fromLocation: { select: { id: true, name: true } },
          toLocation: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.stockTransfer.count({ where }),
    ]);
    return { items, page: input.page, pageSize: input.pageSize, total };
  }

  async transfer(tenant: TenantContext, id: string) {
    const item = await prisma.stockTransfer.findFirst({
      where: {
        id,
        organizationId: tenant.organizationId,
        ...(tenant.branchId
          ? {
              OR: [
                { fromBranchId: tenant.branchId },
                { toBranchId: tenant.branchId },
              ],
            }
          : {}),
      },
      include: {
        fromBranch: true,
        toBranch: true,
        fromLocation: true,
        toLocation: true,
        creator: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
            variant: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    });
    if (!item)
      throw new NotFoundException({
        code: "TRANSFER_NOT_FOUND",
        message: "Stock transfer not found.",
      });
    return item;
  }

  createTransfer(
    tenant: TenantContext,
    userId: string,
    input: CreateTransferInput,
    idempotencyKey?: string,
  ) {
    return this.idempotent(
      tenant.organizationId,
      "inventory.transfer.create",
      idempotencyKey,
      input,
      async (tx) => {
        if (tenant.branchId && tenant.branchId !== input.fromBranchId)
          throw new ForbiddenException({
            code: "BRANCH_SCOPE_VIOLATION",
            message: "Transfers can only be created from your assigned branch.",
          });
        await this.assertLocation(
          tx,
          tenant.organizationId,
          input.fromBranchId,
          input.fromLocationId,
        );
        await this.assertLocation(
          tx,
          tenant.organizationId,
          input.toBranchId,
          input.toLocationId,
        );
        if (input.fromLocationId === input.toLocationId)
          throw new ConflictException({
            code: "SAME_TRANSFER_LOCATION",
            message: "Source and destination locations must differ.",
          });
        const seen = new Set<string>();
        for (const item of input.items) {
          await this.assertStockProduct(
            tx,
            tenant.organizationId,
            item.productId,
            item.variantId,
            false,
          );
          const key = bucketKey(item.productId, item.variantId);
          if (seen.has(key))
            throw new ConflictException({
              code: "DUPLICATE_TRANSFER_ITEM",
              message:
                "A product or variant can only appear once per transfer.",
            });
          seen.add(key);
        }
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenant.organizationId}))`;
        const count = await tx.stockTransfer.count({
          where: { organizationId: tenant.organizationId },
        });
        const transferNumber = `TRF-${new Date().getUTCFullYear()}-${String(count + 1).padStart(6, "0")}`;
        const item = await tx.stockTransfer.create({
          data: {
            organizationId: tenant.organizationId,
            fromBranchId: input.fromBranchId,
            fromLocationId: input.fromLocationId,
            toBranchId: input.toBranchId,
            toLocationId: input.toLocationId,
            transferNumber,
            notes: input.notes,
            createdBy: userId,
            items: {
              create: input.items.map((row) => ({
                productId: row.productId,
                variantId: row.variantId,
                bucketKey: bucketKey(row.productId, row.variantId),
                quantity: row.quantity,
                unitCostMinor: row.unitCostMinor,
              })),
            },
          },
          include: { items: true },
        });
        await this.audit(
          tx,
          tenant.organizationId,
          userId,
          "TRANSFER_CREATED",
          "StockTransfer",
          item.id,
          { transferNumber, itemCount: item.items.length },
        );
        return item;
      },
    );
  }

  send(
    tenant: TenantContext,
    userId: string,
    id: string,
    idempotencyKey?: string,
  ) {
    return this.idempotent(
      tenant.organizationId,
      `inventory.transfer.send:${id}`,
      idempotencyKey,
      { id },
      async (tx) => {
        const transfer = await tx.stockTransfer.findFirst({
          where: { id, organizationId: tenant.organizationId },
          include: { items: true },
        });
        if (!transfer)
          throw new NotFoundException({
            code: "TRANSFER_NOT_FOUND",
            message: "Stock transfer not found.",
          });
        if (tenant.branchId && transfer.fromBranchId !== tenant.branchId)
          throw new ForbiddenException({
            code: "BRANCH_SCOPE_VIOLATION",
            message: "Only the source branch can send this transfer.",
          });
        const claimed = await tx.stockTransfer.updateMany({
          where: { id, organizationId: tenant.organizationId, status: "DRAFT" },
          data: { status: "SENT", sentAt: new Date() },
        });
        if (claimed.count !== 1)
          throw new ConflictException({
            code: "INVALID_TRANSFER_TRANSITION",
            message: "Only a draft transfer can be sent.",
          });
        for (const row of transfer.items)
          await this.writeMovement(tx, tenant, {
            branchId: transfer.fromBranchId,
            locationId: transfer.fromLocationId,
            productId: row.productId,
            variantId: row.variantId,
            quantity: row.quantity.neg(),
            movementType: "TRANSFER_OUT",
            unitCostMinor: row.unitCostMinor,
            referenceType: "StockTransfer",
            referenceId: transfer.id,
            reason: `Transfer ${transfer.transferNumber} sent`,
            userId,
          });
        await this.audit(
          tx,
          tenant.organizationId,
          userId,
          "TRANSFER_SENT",
          "StockTransfer",
          transfer.id,
          { transferNumber: transfer.transferNumber },
        );
        return tx.stockTransfer.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });
      },
    );
  }

  receive(
    tenant: TenantContext,
    userId: string,
    id: string,
    idempotencyKey?: string,
  ) {
    return this.idempotent(
      tenant.organizationId,
      `inventory.transfer.receive:${id}`,
      idempotencyKey,
      { id },
      async (tx) => {
        const transfer = await tx.stockTransfer.findFirst({
          where: { id, organizationId: tenant.organizationId },
          include: { items: true },
        });
        if (!transfer)
          throw new NotFoundException({
            code: "TRANSFER_NOT_FOUND",
            message: "Stock transfer not found.",
          });
        if (tenant.branchId && transfer.toBranchId !== tenant.branchId)
          throw new ForbiddenException({
            code: "BRANCH_SCOPE_VIOLATION",
            message: "Only the destination branch can receive this transfer.",
          });
        const claimed = await tx.stockTransfer.updateMany({
          where: { id, organizationId: tenant.organizationId, status: "SENT" },
          data: { status: "RECEIVED", receivedAt: new Date() },
        });
        if (claimed.count !== 1)
          throw new ConflictException({
            code: "INVALID_TRANSFER_TRANSITION",
            message: "Only a sent transfer can be received.",
          });
        for (const row of transfer.items)
          await this.writeMovement(tx, tenant, {
            branchId: transfer.toBranchId,
            locationId: transfer.toLocationId,
            productId: row.productId,
            variantId: row.variantId,
            quantity: row.quantity,
            movementType: "TRANSFER_IN",
            unitCostMinor: row.unitCostMinor,
            referenceType: "StockTransfer",
            referenceId: transfer.id,
            reason: `Transfer ${transfer.transferNumber} received`,
            userId,
            allowInactiveProduct: true,
          });
        await this.audit(
          tx,
          tenant.organizationId,
          userId,
          "TRANSFER_RECEIVED",
          "StockTransfer",
          transfer.id,
          { transferNumber: transfer.transferNumber },
        );
        return tx.stockTransfer.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });
      },
    );
  }

  async cancel(tenant: TenantContext, userId: string, id: string) {
    return this.serializable(async (tx) => {
      const transfer = await tx.stockTransfer.findFirst({
        where: { id, organizationId: tenant.organizationId },
      });
      if (!transfer)
        throw new NotFoundException({
          code: "TRANSFER_NOT_FOUND",
          message: "Stock transfer not found.",
        });
      if (tenant.branchId && transfer.fromBranchId !== tenant.branchId)
        throw new ForbiddenException({
          code: "BRANCH_SCOPE_VIOLATION",
          message: "Only the source branch can cancel this transfer.",
        });
      const changed = await tx.stockTransfer.updateMany({
        where: { id, status: "DRAFT" },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      if (changed.count !== 1)
        throw new ConflictException({
          code: "INVALID_TRANSFER_TRANSITION",
          message: "Only a draft transfer can be cancelled.",
        });
      await this.audit(
        tx,
        tenant.organizationId,
        userId,
        "TRANSFER_CANCELLED",
        "StockTransfer",
        id,
        { transferNumber: transfer.transferNumber },
      );
      return tx.stockTransfer.findUniqueOrThrow({ where: { id } });
    });
  }

  async reconcile(tenant: TenantContext) {
    const where = {
      organizationId: tenant.organizationId,
      ...(tenant.branchId ? { branchId: tenant.branchId } : {}),
    };
    const [movements, balances] = await Promise.all([
      prisma.stockMovement.groupBy({
        by: ["branchId", "locationId", "productId", "variantId"],
        where,
        _sum: { quantity: true },
      }),
      prisma.inventoryBalance.findMany({
        where,
        select: {
          branchId: true,
          locationId: true,
          productId: true,
          variantId: true,
          quantity: true,
        },
      }),
    ]);
    const ledger = new Map(
      movements.map((row) => [
        bucketKey(row.productId, row.variantId) + `:${row.locationId}`,
        row._sum.quantity ?? new Prisma.Decimal(0),
      ]),
    );
    const cached = new Map(
      balances.map((row) => [
        bucketKey(row.productId, row.variantId) + `:${row.locationId}`,
        row.quantity,
      ]),
    );
    const keys = new Set([...ledger.keys(), ...cached.keys()]);
    const entries = [...keys].map((key) => ({
      key,
      ledger: (ledger.get(key) ?? new Prisma.Decimal(0)).toString(),
      balance: (cached.get(key) ?? new Prisma.Decimal(0)).toString(),
      consistent: (ledger.get(key) ?? new Prisma.Decimal(0)).equals(
        cached.get(key) ?? new Prisma.Decimal(0),
      ),
    }));
    return { consistent: entries.every((entry) => entry.consistent), entries };
  }

  private balanceView(item: {
    quantity: Prisma.Decimal;
    product: { minimumStock: Prisma.Decimal | null };
    [key: string]: unknown;
  }) {
    return {
      ...item,
      lowStock:
        item.product.minimumStock !== null &&
        item.quantity.lte(item.product.minimumStock),
    };
  }

  private async writeMovement(
    tx: Transaction,
    tenant: TenantContext,
    input: MovementInput,
  ) {
    this.assertBranchScope(
      tenant,
      input.branchId,
      input.movementType === "TRANSFER_IN",
    );
    await this.assertLocation(
      tx,
      tenant.organizationId,
      input.branchId,
      input.locationId,
    );
    const product = await this.assertStockProduct(
      tx,
      tenant.organizationId,
      input.productId,
      input.variantId,
      input.allowInactiveProduct ?? false,
    );
    if (input.movementType === "OPENING") {
      const previous = await tx.stockMovement.findFirst({
        where: {
          organizationId: tenant.organizationId,
          locationId: input.locationId,
          productId: input.productId,
          variantId: input.variantId ?? null,
          movementType: "OPENING",
        },
        select: { id: true },
      });
      if (previous)
        throw new ConflictException({
          code: "OPENING_STOCK_EXISTS",
          message:
            "Opening stock has already been posted for this inventory bucket.",
        });
    }
    const key = bucketKey(input.productId, input.variantId);
    const balance = await tx.inventoryBalance.upsert({
      where: {
        organizationId_locationId_bucketKey: {
          organizationId: tenant.organizationId,
          locationId: input.locationId,
          bucketKey: key,
        },
      },
      update: {},
      create: {
        organizationId: tenant.organizationId,
        branchId: input.branchId,
        locationId: input.locationId,
        productId: input.productId,
        variantId: input.variantId,
        bucketKey: key,
        quantity: 0,
      },
    });
    const next = balance.quantity.add(input.quantity);
    if (
      next.isNegative() &&
      !product.allowNegativeStock &&
      !input.allowNegativeOverride
    )
      throw new ConflictException({
        code: "INSUFFICIENT_STOCK",
        message: "This operation would reduce stock below zero.",
      });
    const movement = await tx.stockMovement.create({
      data: {
        organizationId: tenant.organizationId,
        branchId: input.branchId,
        locationId: input.locationId,
        productId: input.productId,
        variantId: input.variantId,
        movementType: input.movementType,
        quantity: input.quantity,
        unitCostMinor: input.unitCostMinor,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        reason: input.reason,
        createdBy: input.userId,
      },
    });
    await tx.inventoryBalance.update({
      where: { id: balance.id },
      data: { quantity: next },
    });
    return movement;
  }

  private async assertLocation(
    tx: Transaction,
    organizationId: string,
    branchId: string,
    locationId: string,
  ) {
    const location = await tx.stockLocation.findFirst({
      where: {
        id: locationId,
        organizationId,
        branchId,
        isActive: true,
        branch: { isActive: true },
      },
      select: { id: true },
    });
    if (!location)
      throw new NotFoundException({
        code: "STOCK_LOCATION_NOT_FOUND",
        message: "Active stock location not found.",
      });
  }

  private async assertStockProduct(
    tx: Transaction,
    organizationId: string,
    productId: string,
    variantId?: string | null,
    allowInactive = false,
  ) {
    const product = await tx.product.findFirst({
      where: {
        id: productId,
        organizationId,
        ...(allowInactive ? {} : { isActive: true }),
      },
      select: {
        id: true,
        type: true,
        trackInventory: true,
        allowNegativeStock: true,
      },
    });
    if (!product)
      throw new NotFoundException({
        code: "PRODUCT_NOT_FOUND",
        message: "Active product not found.",
      });
    if (product.type !== "STOCK_ITEM" || !product.trackInventory)
      throw new ConflictException({
        code: "PRODUCT_NOT_STOCK_TRACKED",
        message: "Inventory movements require a stock-tracked product.",
      });
    if (variantId) {
      const variant = await tx.productVariant.findFirst({
        where: {
          id: variantId,
          productId,
          organizationId,
          ...(allowInactive ? {} : { isActive: true }),
        },
        select: { id: true },
      });
      if (!variant)
        throw new NotFoundException({
          code: "VARIANT_NOT_FOUND",
          message: "Product variant not found.",
        });
    }
    return product;
  }

  private assertBranchScope(
    tenant: TenantContext,
    branchId?: string,
    receiving = false,
  ) {
    if (tenant.branchId && branchId && tenant.branchId !== branchId)
      throw new ForbiddenException({
        code: "BRANCH_SCOPE_VIOLATION",
        message: receiving
          ? "Only the destination branch can receive stock."
          : "The selected branch is outside your membership scope.",
      });
  }

  private async idempotent<T>(
    organizationId: string,
    operation: string,
    key: string | undefined,
    payload: unknown,
    work: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    if (!key) return this.serializable(work);
    const requestHash = hash(payload);
    const existing = await prisma.idempotencyRecord.findUnique({
      where: {
        organizationId_operation_key: { organizationId, operation, key },
      },
    });
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new ConflictException({
          code: "IDEMPOTENCY_KEY_REUSED",
          message: "The idempotency key was used with a different request.",
        });
      if (existing.responseBody !== null) return existing.responseBody as T;
      throw new ConflictException({
        code: "REQUEST_IN_PROGRESS",
        message: "A request with this idempotency key is still processing.",
      });
    }
    try {
      return await this.serializable(async (tx) => {
        const record = await tx.idempotencyRecord.create({
          data: {
            organizationId,
            operation,
            key,
            requestHash,
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        });
        const result = await work(tx);
        await tx.idempotencyRecord.update({
          where: { id: record.id },
          data: { responseCode: 201, responseBody: jsonValue(result) },
        });
        return result;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        return this.idempotent(organizationId, operation, key, payload, work);
      throw error;
    }
  }

  private async serializable<T>(
    work: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2034" ||
          attempt === 3
        )
          throw error;
      }
    }
    throw new ConflictException({
      code: "CONCURRENT_INVENTORY_UPDATE",
      message: "Inventory changed concurrently; retry the operation.",
    });
  }

  private audit(
    tx: Transaction,
    organizationId: string,
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    afterJson: object,
  ) {
    return tx.auditLog.create({
      data: { organizationId, userId, action, entityType, entityId, afterJson },
    });
  }
}
