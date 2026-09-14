import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, prisma } from "@allshops/database";
import type {
  CreateCustomerInput,
  CreateExpenseCategoryInput,
  CreateExpenseInput,
  CreatePurchaseInput,
  CreateSupplierInput,
  CustomerHistoryListInput,
  CustomerListInput,
  CustomerPaymentInput,
  ExpenseCategoryListInput,
  ExpenseListInput,
  PurchaseListInput,
  ReceivePurchaseInput,
  SupplierListInput,
  SupplierPaymentInput,
  SupplierPaymentListInput,
  UpdateCustomerInput,
  UpdateExpenseCategoryInput,
  UpdatePurchaseInput,
  UpdateSupplierInput,
} from "@allshops/contracts";

import { InventoryService } from "./inventory.service.js";
import type { TenantContext } from "./security.types.js";

type Transaction = Prisma.TransactionClient;
type PurchaseLine = {
  id: string;
  productId: string;
  variantId: string | null;
  productNameSnapshot: string;
  variantNameSnapshot: string | null;
  skuSnapshot: string | null;
  orderedQuantity: Prisma.Decimal;
  unitCostMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  grossMinor: number;
};

const normalizeName = (value: string) => value.trim().toLocaleLowerCase();
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const jsonValue = <T>(value: T): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const lineMoney = (minor: number, quantity: Prisma.Decimal) =>
  Number(new Prisma.Decimal(minor).mul(quantity).toFixed(0));

@Injectable()
export class Phase4Service {
  constructor(private readonly inventory: InventoryService) {}

  async createSupplier(
    tenant: TenantContext,
    userId: string,
    input: CreateSupplierInput,
  ) {
    return this.serializable(async (tx) => {
      const supplier = await tx.supplier.create({
        data: {
          ...input,
          organizationId: tenant.organizationId,
          normalizedName: normalizeName(input.name),
          createdBy: userId,
        },
      });
      await this.audit(
        tx,
        tenant,
        userId,
        "SUPPLIER_CREATED",
        "Supplier",
        supplier.id,
        {
          name: supplier.name,
        },
      );
      return supplier;
    });
  }

  async suppliers(tenant: TenantContext, input: SupplierListInput) {
    const where: Prisma.SupplierWhereInput = {
      organizationId: tenant.organizationId,
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      ...(input.search
        ? {
            OR: ["name", "contactName", "phone", "email"].map((field) => ({
              [field]: { contains: input.search, mode: "insensitive" },
            })) as Prisma.SupplierWhereInput[],
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.supplier.findMany({
        where,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        orderBy: { name: "asc" },
        include: {
          purchases: {
            where: { status: { not: "CANCELLED" } },
            select: { totalMinor: true, balanceMinor: true },
          },
        },
      }),
      prisma.supplier.count({ where }),
    ]);
    return {
      items: items.map(({ purchases, ...supplier }) => ({
        ...supplier,
        totalPurchasesMinor: purchases.reduce(
          (sum, row) => sum + row.totalMinor,
          0,
        ),
        outstandingMinor: purchases.reduce(
          (sum, row) => sum + row.balanceMinor,
          0,
        ),
      })),
      page: input.page,
      pageSize: input.pageSize,
      total,
    };
  }

  async supplier(tenant: TenantContext, supplierId: string) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, organizationId: tenant.organizationId },
      include: {
        purchases: {
          orderBy: { purchaseDate: "desc" },
          take: 25,
          include: { branch: { select: { id: true, name: true } } },
        },
        payments: { orderBy: { paidAt: "desc" }, take: 25 },
      },
    });
    if (!supplier)
      throw this.notFound("SUPPLIER_NOT_FOUND", "Supplier not found.");
    return {
      ...supplier,
      totalPurchasesMinor: supplier.purchases
        .filter((row) => row.status !== "CANCELLED")
        .reduce((sum, row) => sum + row.totalMinor, 0),
      outstandingMinor: supplier.purchases
        .filter((row) => row.status !== "CANCELLED")
        .reduce((sum, row) => sum + row.balanceMinor, 0),
    };
  }

  async updateSupplier(
    tenant: TenantContext,
    userId: string,
    supplierId: string,
    input: UpdateSupplierInput,
  ) {
    return this.serializable(async (tx) => {
      const before = await tx.supplier.findFirst({
        where: { id: supplierId, organizationId: tenant.organizationId },
      });
      if (!before)
        throw this.notFound("SUPPLIER_NOT_FOUND", "Supplier not found.");
      const supplier = await tx.supplier.update({
        where: { id: supplierId },
        data: {
          ...input,
          ...(input.name ? { normalizedName: normalizeName(input.name) } : {}),
        },
      });
      await this.audit(
        tx,
        tenant,
        userId,
        "SUPPLIER_UPDATED",
        "Supplier",
        supplier.id,
        input,
        before,
      );
      return supplier;
    });
  }

  async createPurchase(
    tenant: TenantContext,
    userId: string,
    input: CreatePurchaseInput,
  ) {
    this.assertBranch(tenant, input.branchId);
    return this.serializable(async (tx) => {
      await this.activeBranch(tx, tenant.organizationId, input.branchId);
      await this.activeSupplier(tx, tenant.organizationId, input.supplierId);
      const lines = await this.resolvePurchaseLines(
        tx,
        tenant.organizationId,
        input.items,
      );
      const totals = this.purchaseTotals(lines, input.discountMinor);
      const purchaseNumber = await this.nextNumber(
        tx,
        tenant.organizationId,
        "PURCHASE",
        "PUR",
      );
      const purchase = await tx.purchase.create({
        data: {
          organizationId: tenant.organizationId,
          branchId: input.branchId,
          supplierId: input.supplierId,
          purchaseNumber,
          supplierInvoiceNumber: input.supplierInvoiceNumber,
          purchaseDate: input.purchaseDate,
          expectedDate: input.expectedDate,
          notes: input.notes,
          createdBy: userId,
          ...totals,
          balanceMinor: totals.totalMinor,
          items: {
            create: lines.map((line) =>
              this.purchaseLineData(tenant.organizationId, line),
            ),
          },
        },
        include: { items: true },
      });
      await this.audit(
        tx,
        tenant,
        userId,
        "PURCHASE_CREATED",
        "Purchase",
        purchase.id,
        {
          purchaseNumber,
          totalMinor: purchase.totalMinor,
          branchId: purchase.branchId,
        },
      );
      return purchase;
    });
  }

  async purchases(tenant: TenantContext, input: PurchaseListInput) {
    this.assertBranch(tenant, input.branchId);
    const where: Prisma.PurchaseWhereInput = {
      organizationId: tenant.organizationId,
      ...(tenant.branchId
        ? { branchId: tenant.branchId }
        : input.branchId
          ? { branchId: input.branchId }
          : {}),
      ...(input.supplierId ? { supplierId: input.supplierId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.purchaseNumber
        ? {
            purchaseNumber: {
              contains: input.purchaseNumber,
              mode: "insensitive",
            },
          }
        : {}),
      ...(input.supplierInvoiceNumber
        ? {
            supplierInvoiceNumber: {
              contains: input.supplierInvoiceNumber,
              mode: "insensitive",
            },
          }
        : {}),
      ...(input.paymentStatus === "PAID"
        ? { balanceMinor: 0 }
        : input.paymentStatus === "UNPAID"
          ? { paidMinor: 0, balanceMinor: { gt: 0 } }
          : input.paymentStatus === "PARTIALLY_PAID"
            ? { paidMinor: { gt: 0 }, balanceMinor: { gt: 0 } }
            : {}),
      ...(input.dateFrom || input.dateTo
        ? {
            purchaseDate: {
              ...(input.dateFrom ? { gte: input.dateFrom } : {}),
              ...(input.dateTo ? { lte: input.dateTo } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.purchase.findMany({
        where,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        orderBy: { purchaseDate: "desc" },
        include: {
          supplier: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
          _count: { select: { items: true, payments: true } },
        },
      }),
      prisma.purchase.count({ where }),
    ]);
    return { items, page: input.page, pageSize: input.pageSize, total };
  }

  async purchase(tenant: TenantContext, purchaseId: string) {
    const purchase = await prisma.purchase.findFirst({
      where: {
        id: purchaseId,
        organizationId: tenant.organizationId,
        ...(tenant.branchId ? { branchId: tenant.branchId } : {}),
      },
      include: {
        supplier: true,
        branch: { select: { id: true, name: true, code: true } },
        creator: { select: { id: true, name: true } },
        items: { orderBy: { createdAt: "asc" } },
        payments: { orderBy: { paidAt: "asc" } },
      },
    });
    if (!purchase)
      throw this.notFound("PURCHASE_NOT_FOUND", "Purchase not found.");
    return purchase;
  }

  async updatePurchase(
    tenant: TenantContext,
    userId: string,
    purchaseId: string,
    input: UpdatePurchaseInput,
  ) {
    return this.serializable(async (tx) => {
      const current = await tx.purchase.findFirst({
        where: { id: purchaseId, organizationId: tenant.organizationId },
        include: { items: true },
      });
      if (!current)
        throw this.notFound("PURCHASE_NOT_FOUND", "Purchase not found.");
      this.assertBranch(tenant, current.branchId);
      if (current.status !== "DRAFT")
        throw this.conflict(
          "PURCHASE_NOT_EDITABLE",
          "Only a draft purchase can be edited.",
        );
      if (input.supplierId)
        await this.activeSupplier(tx, tenant.organizationId, input.supplierId);
      const lines = input.items
        ? await this.resolvePurchaseLines(
            tx,
            tenant.organizationId,
            input.items,
          )
        : current.items.map((row) => ({
            id: row.id,
            productId: row.productId,
            variantId: row.variantId,
            productNameSnapshot: row.productNameSnapshot,
            variantNameSnapshot: row.variantNameSnapshot,
            skuSnapshot: row.skuSnapshot,
            orderedQuantity: row.orderedQuantity,
            unitCostMinor: row.unitCostMinor,
            discountMinor: row.discountMinor,
            taxMinor: row.taxMinor,
            totalMinor: row.totalMinor,
            grossMinor: lineMoney(row.unitCostMinor, row.orderedQuantity),
          }));
      const totals = this.purchaseTotals(
        lines,
        input.discountMinor ??
          Math.max(
            0,
            current.discountMinor -
              current.items.reduce((sum, row) => sum + row.discountMinor, 0),
          ),
      );
      if (input.items) {
        await tx.purchaseItem.deleteMany({ where: { purchaseId: current.id } });
        await tx.purchaseItem.createMany({
          data: lines.map((line) => ({
            ...this.purchaseLineData(tenant.organizationId, line),
            purchaseId: current.id,
          })),
        });
      }
      const purchase = await tx.purchase.update({
        where: { id: current.id },
        data: {
          supplierId: input.supplierId,
          supplierInvoiceNumber: input.supplierInvoiceNumber,
          purchaseDate: input.purchaseDate,
          expectedDate: input.expectedDate,
          notes: input.notes,
          ...totals,
          balanceMinor: totals.totalMinor - current.paidMinor,
        },
      });
      await this.audit(
        tx,
        tenant,
        userId,
        "PURCHASE_UPDATED",
        "Purchase",
        purchase.id,
        input,
      );
      return purchase;
    });
  }

  receivePurchase(
    tenant: TenantContext,
    userId: string,
    purchaseId: string,
    input: ReceivePurchaseInput,
    key: string,
  ) {
    return this.idempotent(
      tenant.organizationId,
      `purchase.receive:${purchaseId}`,
      key,
      input,
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`purchase:${purchaseId}`}))`;
        const purchase = await tx.purchase.findFirst({
          where: { id: purchaseId, organizationId: tenant.organizationId },
          include: { items: true },
        });
        if (!purchase)
          throw this.notFound("PURCHASE_NOT_FOUND", "Purchase not found.");
        this.assertBranch(tenant, purchase.branchId);
        if (purchase.status === "CANCELLED" || purchase.status === "RECEIVED")
          throw this.conflict(
            "PURCHASE_NOT_RECEIVABLE",
            "This purchase cannot receive more goods.",
          );
        const seen = new Set<string>();
        const byId = new Map(purchase.items.map((item) => [item.id, item]));
        const receipt = input.items.map((requested) => {
          if (seen.has(requested.purchaseItemId))
            throw this.conflict(
              "DUPLICATE_RECEIPT_ITEM",
              "A purchase item can only appear once per receipt.",
            );
          seen.add(requested.purchaseItemId);
          const item = byId.get(requested.purchaseItemId);
          if (!item)
            throw this.notFound(
              "PURCHASE_ITEM_NOT_FOUND",
              "Purchase item not found.",
            );
          const quantity = new Prisma.Decimal(requested.quantity);
          if (item.receivedQuantity.add(quantity).gt(item.orderedQuantity))
            throw this.conflict(
              "RECEIVE_EXCEEDS_REMAINING",
              "Receipt quantity exceeds the remaining ordered quantity.",
            );
          return { item, quantity };
        });
        for (const { item, quantity } of receipt) {
          await this.inventory.postPurchaseMovement(tx, tenant, {
            branchId: purchase.branchId,
            locationId: input.locationId,
            productId: item.productId,
            variantId: item.variantId,
            quantity,
            unitCostMinor: item.unitCostMinor,
            purchaseId: purchase.id,
            purchaseItemId: item.id,
            userId,
          });
          await tx.purchaseItem.update({
            where: { id: item.id },
            data: { receivedQuantity: { increment: quantity } },
          });
          if (item.variantId)
            await tx.productVariant.update({
              where: { id: item.variantId },
              data: { costMinor: item.unitCostMinor },
            });
          else
            await tx.product.update({
              where: { id: item.productId },
              data: { costMinor: item.unitCostMinor },
            });
        }
        const quantities = new Map(
          receipt.map(({ item, quantity }) => [
            item.id,
            item.receivedQuantity.add(quantity),
          ]),
        );
        const complete = purchase.items.every((item) =>
          (quantities.get(item.id) ?? item.receivedQuantity).equals(
            item.orderedQuantity,
          ),
        );
        const updated = await tx.purchase.update({
          where: { id: purchase.id },
          data: {
            status: complete ? "RECEIVED" : "PARTIALLY_RECEIVED",
            receivedAt: complete ? new Date() : null,
          },
        });
        await this.audit(
          tx,
          tenant,
          userId,
          complete ? "PURCHASE_RECEIVED" : "PURCHASE_PARTIALLY_RECEIVED",
          "Purchase",
          purchase.id,
          { locationId: input.locationId, items: input.items },
        );
        return updated;
      },
    );
  }

  async cancelPurchase(
    tenant: TenantContext,
    userId: string,
    purchaseId: string,
  ) {
    return this.serializable(async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id: purchaseId, organizationId: tenant.organizationId },
      });
      if (!purchase)
        throw this.notFound("PURCHASE_NOT_FOUND", "Purchase not found.");
      this.assertBranch(tenant, purchase.branchId);
      const changed = await tx.purchase.updateMany({
        where: { id: purchase.id, status: "DRAFT", paidMinor: 0 },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      if (changed.count !== 1)
        throw this.conflict(
          "PURCHASE_NOT_CANCELLABLE",
          "Only an unpaid draft purchase can be cancelled.",
        );
      await this.audit(
        tx,
        tenant,
        userId,
        "PURCHASE_CANCELLED",
        "Purchase",
        purchase.id,
        {},
      );
      return tx.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
    });
  }

  supplierPayment(
    tenant: TenantContext,
    userId: string,
    supplierId: string,
    input: SupplierPaymentInput,
    key: string,
  ) {
    return this.idempotent(
      tenant.organizationId,
      `supplier.payment:${supplierId}`,
      key,
      input,
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`supplier-payment:${input.purchaseId}`}))`;
        const purchase = await tx.purchase.findFirst({
          where: {
            id: input.purchaseId,
            supplierId,
            organizationId: tenant.organizationId,
            status: { not: "CANCELLED" },
          },
        });
        if (!purchase)
          throw this.notFound(
            "PURCHASE_NOT_FOUND",
            "Supplier purchase not found.",
          );
        this.assertBranch(tenant, purchase.branchId);
        if (input.amountMinor > purchase.balanceMinor)
          throw this.conflict(
            "SUPPLIER_OVERPAYMENT",
            "Payment exceeds the purchase outstanding balance.",
          );
        const payment = await tx.supplierPayment.create({
          data: {
            organizationId: tenant.organizationId,
            supplierId,
            purchaseId: purchase.id,
            amountMinor: input.amountMinor,
            method: input.method,
            reference: input.reference,
            paidAt: input.paidAt,
            notes: input.notes,
            createdBy: userId,
          },
        });
        await tx.purchase.update({
          where: { id: purchase.id },
          data: {
            paidMinor: { increment: input.amountMinor },
            balanceMinor: { decrement: input.amountMinor },
          },
        });
        await this.audit(
          tx,
          tenant,
          userId,
          "SUPPLIER_PAYMENT_RECORDED",
          "SupplierPayment",
          payment.id,
          {
            supplierId,
            purchaseId: purchase.id,
            amountMinor: input.amountMinor,
            method: input.method,
          },
        );
        return payment;
      },
    );
  }

  async supplierPayments(
    tenant: TenantContext,
    supplierId: string,
    input: SupplierPaymentListInput,
  ) {
    await this.activeSupplier(prisma, tenant.organizationId, supplierId, true);
    const where: Prisma.SupplierPaymentWhereInput = {
      organizationId: tenant.organizationId,
      supplierId,
      ...(input.purchaseId ? { purchaseId: input.purchaseId } : {}),
      ...(input.dateFrom || input.dateTo
        ? {
            paidAt: {
              ...(input.dateFrom ? { gte: input.dateFrom } : {}),
              ...(input.dateTo ? { lte: input.dateTo } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.supplierPayment.findMany({
        where,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        orderBy: { paidAt: "desc" },
        include: {
          purchase: { select: { id: true, purchaseNumber: true } },
          creator: { select: { id: true, name: true } },
        },
      }),
      prisma.supplierPayment.count({ where }),
    ]);
    return { items, page: input.page, pageSize: input.pageSize, total };
  }

  async createCustomer(
    tenant: TenantContext,
    userId: string,
    input: CreateCustomerInput,
  ) {
    return this.serializable(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          ...input,
          organizationId: tenant.organizationId,
          createdBy: userId,
        },
      });
      await this.audit(
        tx,
        tenant,
        userId,
        "CUSTOMER_CREATED",
        "Customer",
        customer.id,
        { name: customer.name },
      );
      return this.customerView(tenant, customer);
    });
  }

  async customers(tenant: TenantContext, input: CustomerListInput) {
    const where: Prisma.CustomerWhereInput = {
      organizationId: tenant.organizationId,
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      ...(input.search
        ? {
            OR: ["name", "phone", "email"].map((field) => ({
              [field]: { contains: input.search, mode: "insensitive" },
            })) as Prisma.CustomerWhereInput[],
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.customer.findMany({
        where,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        orderBy: { name: "asc" },
        include: {
          sales: {
            where: { status: "COMPLETED" },
            select: { totalMinor: true },
          },
        },
      }),
      prisma.customer.count({ where }),
    ]);
    return {
      items: items.map(({ sales, ...customer }) => ({
        ...this.customerView(tenant, customer),
        totalPurchasesMinor: sales.reduce(
          (sum, sale) => sum + sale.totalMinor,
          0,
        ),
      })),
      page: input.page,
      pageSize: input.pageSize,
      total,
    };
  }

  async customer(tenant: TenantContext, customerId: string) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, organizationId: tenant.organizationId },
      include: {
        sales: {
          where: { status: "COMPLETED" },
          orderBy: { completedAt: "desc" },
          take: 25,
        },
        payments: { orderBy: { paidAt: "desc" }, take: 25 },
        ledger: {
          orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
          take: 25,
        },
      },
    });
    if (!customer)
      throw this.notFound("CUSTOMER_NOT_FOUND", "Customer not found.");
    const { sales, payments, ledger, ...profile } = customer;
    const mayRead = tenant.permissions.includes("customer_balance.read");
    return {
      ...this.customerView(tenant, profile),
      ...(mayRead ? { sales, payments, ledger } : { sales: [] }),
      totalPurchasesMinor: sales.reduce(
        (sum, sale) => sum + sale.totalMinor,
        0,
      ),
    };
  }

  async updateCustomer(
    tenant: TenantContext,
    userId: string,
    customerId: string,
    input: UpdateCustomerInput,
  ) {
    return this.serializable(async (tx) => {
      const before = await tx.customer.findFirst({
        where: { id: customerId, organizationId: tenant.organizationId },
      });
      if (!before)
        throw this.notFound("CUSTOMER_NOT_FOUND", "Customer not found.");
      if (
        input.creditLimitMinor !== undefined &&
        input.creditLimitMinor !== null &&
        input.creditLimitMinor < before.balanceMinor
      )
        throw this.conflict(
          "CREDIT_LIMIT_BELOW_BALANCE",
          "Credit limit cannot be below the current outstanding balance.",
        );
      const customer = await tx.customer.update({
        where: { id: customerId },
        data: input,
      });
      await this.audit(
        tx,
        tenant,
        userId,
        "CUSTOMER_UPDATED",
        "Customer",
        customer.id,
        input,
        before,
      );
      return this.customerView(tenant, customer);
    });
  }

  customerPayment(
    tenant: TenantContext,
    userId: string,
    customerId: string,
    input: CustomerPaymentInput,
    key: string,
  ) {
    return this.idempotent(
      tenant.organizationId,
      `customer.payment:${customerId}`,
      key,
      input,
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`customer:${customerId}`}))`;
        const customer = await tx.customer.findFirst({
          where: { id: customerId, organizationId: tenant.organizationId },
        });
        if (!customer)
          throw this.notFound("CUSTOMER_NOT_FOUND", "Customer not found.");
        if (input.amountMinor > customer.balanceMinor)
          throw this.conflict(
            "CUSTOMER_OVERPAYMENT",
            "Payment exceeds the customer outstanding balance.",
          );
        const sales = await tx.sale.findMany({
          where: {
            organizationId: tenant.organizationId,
            customerId,
            status: "COMPLETED",
            balanceMinor: { gt: 0 },
            ...(input.saleId ? { id: input.saleId } : {}),
          },
          orderBy: [{ completedAt: "asc" }, { createdAt: "asc" }],
        });
        if (input.saleId && sales.length !== 1)
          throw this.notFound(
            "CREDIT_SALE_NOT_FOUND",
            "Outstanding customer sale not found.",
          );
        if (input.saleId && input.amountMinor > sales[0]!.balanceMinor)
          throw this.conflict(
            "CUSTOMER_OVERPAYMENT",
            "Payment exceeds the selected sale balance.",
          );
        const payment = await tx.customerPayment.create({
          data: {
            organizationId: tenant.organizationId,
            customerId,
            amountMinor: input.amountMinor,
            method: input.method,
            reference: input.reference,
            paidAt: input.paidAt,
            notes: input.notes,
            createdBy: userId,
          },
        });
        let remaining = input.amountMinor;
        for (const sale of sales) {
          if (remaining === 0) break;
          const allocated = Math.min(remaining, sale.balanceMinor);
          const nextBalance = sale.balanceMinor - allocated;
          const nextPaid = sale.paidMinor + allocated;
          await tx.customerPaymentAllocation.create({
            data: {
              organizationId: tenant.organizationId,
              customerPaymentId: payment.id,
              saleId: sale.id,
              amountMinor: allocated,
            },
          });
          await tx.sale.update({
            where: { id: sale.id },
            data: {
              paidMinor: nextPaid,
              balanceMinor: nextBalance,
              paymentStatus: nextBalance === 0 ? "PAID" : "PARTIALLY_PAID",
            },
          });
          remaining -= allocated;
        }
        if (remaining !== 0)
          throw this.conflict(
            "CUSTOMER_LEDGER_MISMATCH",
            "Customer sales do not reconcile with the outstanding balance.",
          );
        const nextBalance = customer.balanceMinor - input.amountMinor;
        await tx.customer.update({
          where: { id: customer.id },
          data: { balanceMinor: nextBalance },
        });
        await tx.customerLedgerEntry.create({
          data: {
            organizationId: tenant.organizationId,
            customerId,
            entryType: "PAYMENT",
            referenceType: "CUSTOMER_PAYMENT",
            referenceId: payment.id,
            creditMinor: input.amountMinor,
            balanceAfterMinor: nextBalance,
            description: "Customer repayment",
            occurredAt: input.paidAt,
            createdBy: userId,
          },
        });
        await this.audit(
          tx,
          tenant,
          userId,
          "CUSTOMER_PAYMENT_RECORDED",
          "CustomerPayment",
          payment.id,
          {
            customerId,
            amountMinor: input.amountMinor,
            resultingBalanceMinor: nextBalance,
          },
        );
        return tx.customerPayment.findUniqueOrThrow({
          where: { id: payment.id },
          include: { allocations: true },
        });
      },
    );
  }

  async customerPayments(
    tenant: TenantContext,
    customerId: string,
    input: CustomerHistoryListInput,
  ) {
    await this.requireCustomer(tenant, customerId);
    const where: Prisma.CustomerPaymentWhereInput = {
      organizationId: tenant.organizationId,
      customerId,
      ...(input.dateFrom || input.dateTo
        ? {
            paidAt: {
              ...(input.dateFrom ? { gte: input.dateFrom } : {}),
              ...(input.dateTo ? { lte: input.dateTo } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.customerPayment.findMany({
        where,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        orderBy: { paidAt: "desc" },
        include: {
          allocations: {
            include: { sale: { select: { id: true, invoiceNumber: true } } },
          },
        },
      }),
      prisma.customerPayment.count({ where }),
    ]);
    return { items, page: input.page, pageSize: input.pageSize, total };
  }

  async customerLedger(
    tenant: TenantContext,
    customerId: string,
    input: CustomerHistoryListInput,
  ) {
    await this.requireCustomer(tenant, customerId);
    const where: Prisma.CustomerLedgerEntryWhereInput = {
      organizationId: tenant.organizationId,
      customerId,
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
      prisma.customerLedgerEntry.findMany({
        where,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      }),
      prisma.customerLedgerEntry.count({ where }),
    ]);
    return { items, page: input.page, pageSize: input.pageSize, total };
  }

  async createExpenseCategory(
    tenant: TenantContext,
    userId: string,
    input: CreateExpenseCategoryInput,
  ) {
    return this.serializable(async (tx) => {
      const category = await tx.expenseCategory.create({
        data: {
          organizationId: tenant.organizationId,
          name: input.name,
          normalizedName: normalizeName(input.name),
          description: input.description,
        },
      });
      await this.audit(
        tx,
        tenant,
        userId,
        "EXPENSE_CATEGORY_CREATED",
        "ExpenseCategory",
        category.id,
        { name: category.name },
      );
      return category;
    });
  }

  async expenseCategories(
    tenant: TenantContext,
    input: ExpenseCategoryListInput,
  ) {
    const where: Prisma.ExpenseCategoryWhereInput = {
      organizationId: tenant.organizationId,
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      ...(input.search
        ? { name: { contains: input.search, mode: "insensitive" } }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.expenseCategory.findMany({
        where,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        orderBy: { name: "asc" },
      }),
      prisma.expenseCategory.count({ where }),
    ]);
    return { items, page: input.page, pageSize: input.pageSize, total };
  }

  async updateExpenseCategory(
    tenant: TenantContext,
    userId: string,
    categoryId: string,
    input: UpdateExpenseCategoryInput,
  ) {
    return this.serializable(async (tx) => {
      const before = await tx.expenseCategory.findFirst({
        where: { id: categoryId, organizationId: tenant.organizationId },
      });
      if (!before)
        throw this.notFound(
          "EXPENSE_CATEGORY_NOT_FOUND",
          "Expense category not found.",
        );
      const category = await tx.expenseCategory.update({
        where: { id: categoryId },
        data: {
          ...input,
          ...(input.name ? { normalizedName: normalizeName(input.name) } : {}),
        },
      });
      await this.audit(
        tx,
        tenant,
        userId,
        "EXPENSE_CATEGORY_UPDATED",
        "ExpenseCategory",
        category.id,
        input,
        before,
      );
      return category;
    });
  }

  createExpense(
    tenant: TenantContext,
    userId: string,
    input: CreateExpenseInput,
    key: string,
  ) {
    this.assertBranch(tenant, input.branchId);
    return this.idempotent(
      tenant.organizationId,
      "expense.create",
      key,
      input,
      async (tx) => {
        await this.activeBranch(tx, tenant.organizationId, input.branchId);
        const category = await tx.expenseCategory.findFirst({
          where: {
            id: input.categoryId,
            organizationId: tenant.organizationId,
            isActive: true,
          },
        });
        if (!category)
          throw this.notFound(
            "EXPENSE_CATEGORY_NOT_FOUND",
            "Active expense category not found.",
          );
        const expense = await tx.expense.create({
          data: {
            ...input,
            organizationId: tenant.organizationId,
            createdBy: userId,
          },
        });
        await this.audit(
          tx,
          tenant,
          userId,
          "EXPENSE_CREATED",
          "Expense",
          expense.id,
          {
            branchId: expense.branchId,
            categoryId: expense.categoryId,
            amountMinor: expense.amountMinor,
            method: expense.paymentMethod,
          },
        );
        return expense;
      },
    );
  }

  async expenses(tenant: TenantContext, input: ExpenseListInput) {
    this.assertBranch(tenant, input.branchId);
    const where: Prisma.ExpenseWhereInput = {
      organizationId: tenant.organizationId,
      ...(tenant.branchId
        ? { branchId: tenant.branchId }
        : input.branchId
          ? { branchId: input.branchId }
          : {}),
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
      ...(input.createdBy ? { createdBy: input.createdBy } : {}),
      ...(input.dateFrom || input.dateTo
        ? {
            expenseDate: {
              ...(input.dateFrom ? { gte: input.dateFrom } : {}),
              ...(input.dateTo ? { lte: input.dateTo } : {}),
            },
          }
        : {}),
    };
    const [items, total, aggregate] = await prisma.$transaction([
      prisma.expense.findMany({
        where,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        orderBy: { expenseDate: "desc" },
        include: {
          branch: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true } },
        },
      }),
      prisma.expense.count({ where }),
      prisma.expense.aggregate({
        where: { ...where, status: "RECORDED" },
        _sum: { amountMinor: true },
      }),
    ]);
    return {
      items,
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalMinor: aggregate._sum.amountMinor ?? 0,
    };
  }

  async expense(tenant: TenantContext, expenseId: string) {
    const expense = await prisma.expense.findFirst({
      where: {
        id: expenseId,
        organizationId: tenant.organizationId,
        ...(tenant.branchId ? { branchId: tenant.branchId } : {}),
      },
      include: {
        branch: true,
        category: true,
        creator: { select: { id: true, name: true } },
      },
    });
    if (!expense)
      throw this.notFound("EXPENSE_NOT_FOUND", "Expense not found.");
    return expense;
  }

  private async resolvePurchaseLines(
    tx: Transaction,
    organizationId: string,
    items: CreatePurchaseInput["items"],
  ): Promise<PurchaseLine[]> {
    const seen = new Set<string>();
    const products = await tx.product.findMany({
      where: {
        organizationId,
        id: { in: [...new Set(items.map((item) => item.productId))] },
      },
      include: { variants: true },
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    return items.map((item) => {
      const key = `${item.productId}:${item.variantId ?? "BASE"}`;
      if (seen.has(key))
        throw this.conflict(
          "DUPLICATE_PURCHASE_ITEM",
          "A product or variant can only appear once.",
        );
      seen.add(key);
      const product = byId.get(item.productId);
      if (!product || !product.isActive)
        throw this.notFound("PRODUCT_NOT_FOUND", "Active product not found.");
      if (product.type !== "STOCK_ITEM" || !product.trackInventory)
        throw new BadRequestException({
          code: "PRODUCT_NOT_RECEIVABLE",
          message: "Purchases require stock-tracked stock items.",
        });
      const variant = item.variantId
        ? product.variants.find(
            (row) => row.id === item.variantId && row.isActive,
          )
        : null;
      if (item.variantId && !variant)
        throw this.notFound(
          "VARIANT_NOT_FOUND",
          "Active product variant not found.",
        );
      const quantity = new Prisma.Decimal(item.quantity);
      const grossMinor = lineMoney(item.unitCostMinor, quantity);
      if (item.discountMinor > grossMinor)
        throw new BadRequestException({
          code: "INVALID_PURCHASE_DISCOUNT",
          message: "Line discount cannot exceed line subtotal.",
        });
      return {
        id: randomUUID(),
        productId: product.id,
        variantId: variant?.id ?? null,
        productNameSnapshot: product.name,
        variantNameSnapshot: variant?.name ?? null,
        skuSnapshot: variant?.sku ?? product.sku,
        orderedQuantity: quantity,
        unitCostMinor: item.unitCostMinor,
        discountMinor: item.discountMinor,
        taxMinor: item.taxMinor,
        totalMinor: grossMinor - item.discountMinor + item.taxMinor,
        grossMinor,
      };
    });
  }

  private purchaseTotals(lines: PurchaseLine[], purchaseDiscountMinor: number) {
    const subtotalMinor = lines.reduce((sum, line) => sum + line.grossMinor, 0);
    const lineDiscount = lines.reduce(
      (sum, line) => sum + line.discountMinor,
      0,
    );
    const discountMinor = purchaseDiscountMinor + lineDiscount;
    const taxMinor = lines.reduce((sum, line) => sum + line.taxMinor, 0);
    if (discountMinor > subtotalMinor)
      throw new BadRequestException({
        code: "INVALID_PURCHASE_DISCOUNT",
        message: "Discount cannot exceed purchase subtotal.",
      });
    const totalMinor = subtotalMinor - discountMinor + taxMinor;
    if (totalMinor > 2_147_483_647)
      throw new BadRequestException({
        code: "PURCHASE_TOTAL_TOO_LARGE",
        message: "Purchase total is too large.",
      });
    return { subtotalMinor, discountMinor, taxMinor, totalMinor };
  }

  private purchaseLineData(organizationId: string, line: PurchaseLine) {
    return {
      id: line.id,
      organizationId,
      productId: line.productId,
      variantId: line.variantId,
      productNameSnapshot: line.productNameSnapshot,
      variantNameSnapshot: line.variantNameSnapshot,
      skuSnapshot: line.skuSnapshot,
      orderedQuantity: line.orderedQuantity,
      unitCostMinor: line.unitCostMinor,
      discountMinor: line.discountMinor,
      taxMinor: line.taxMinor,
      totalMinor: line.totalMinor,
    };
  }

  private customerView<
    T extends { balanceMinor: number; creditLimitMinor: number | null },
  >(tenant: TenantContext, customer: T) {
    if (tenant.permissions.includes("customer_balance.read"))
      return {
        ...customer,
        availableCreditMinor:
          customer.creditLimitMinor === null
            ? null
            : customer.creditLimitMinor - customer.balanceMinor,
      };
    return {
      ...customer,
      balanceMinor: undefined,
      creditLimitMinor: undefined,
    };
  }

  private async requireCustomer(tenant: TenantContext, customerId: string) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, organizationId: tenant.organizationId },
    });
    if (!customer)
      throw this.notFound("CUSTOMER_NOT_FOUND", "Customer not found.");
    return customer;
  }

  private async activeSupplier(
    tx: Transaction | typeof prisma,
    organizationId: string,
    supplierId: string,
    includeInactive = false,
  ) {
    const supplier = await tx.supplier.findFirst({
      where: {
        id: supplierId,
        organizationId,
        ...(includeInactive ? {} : { isActive: true }),
      },
    });
    if (!supplier)
      throw this.notFound("SUPPLIER_NOT_FOUND", "Active supplier not found.");
    return supplier;
  }

  private async activeBranch(
    tx: Transaction,
    organizationId: string,
    branchId: string,
  ) {
    const branch = await tx.branch.findFirst({
      where: { id: branchId, organizationId, isActive: true },
    });
    if (!branch)
      throw this.notFound("BRANCH_NOT_FOUND", "Active branch not found.");
    return branch;
  }

  private assertBranch(tenant: TenantContext, branchId?: string) {
    if (tenant.branchId && branchId && tenant.branchId !== branchId)
      throw new ForbiddenException({
        code: "BRANCH_SCOPE_VIOLATION",
        message: "The selected branch is outside your membership scope.",
      });
  }

  private async nextNumber(
    tx: Transaction,
    organizationId: string,
    documentType: string,
    prefix: string,
  ) {
    const year = new Date().getUTCFullYear();
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:${documentType}:${year}`}))`;
    const sequence = await tx.invoiceSequence.upsert({
      where: {
        organizationId_year_documentType: {
          organizationId,
          year,
          documentType,
        },
      },
      create: { organizationId, year, documentType, currentValue: 1 },
      update: { currentValue: { increment: 1 } },
    });
    return `${prefix}-${year}-${String(sequence.currentValue).padStart(6, "0")}`;
  }

  private async idempotent<T>(
    organizationId: string,
    operation: string,
    key: string,
    payload: unknown,
    work: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    const requestHash = hash(payload);
    const existing = await prisma.idempotencyRecord.findUnique({
      where: {
        organizationId_operation_key: { organizationId, operation, key },
      },
    });
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw this.conflict(
          "IDEMPOTENCY_KEY_REUSED",
          "The idempotency key was used with a different request.",
        );
      if (existing.responseBody !== null) return existing.responseBody as T;
      throw this.conflict(
        "REQUEST_IN_PROGRESS",
        "A request with this idempotency key is still processing.",
      );
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
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2034" ||
          attempt === 4
        )
          throw error;
      }
    }
    throw this.conflict(
      "CONCURRENT_FINANCIAL_UPDATE",
      "Data changed concurrently; retry the operation.",
    );
  }

  private audit(
    tx: Transaction,
    tenant: TenantContext,
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    afterJson: object,
    beforeJson?: object,
  ) {
    return tx.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        userId,
        action,
        entityType,
        entityId,
        beforeJson: beforeJson ? jsonValue(beforeJson) : undefined,
        afterJson: jsonValue(afterJson),
      },
    });
  }

  private notFound(code: string, message: string) {
    return new NotFoundException({ code, message });
  }

  private conflict(code: string, message: string) {
    return new ConflictException({ code, message });
  }
}
