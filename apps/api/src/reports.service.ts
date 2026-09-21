import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@allshops/database";
import type {
  CommissionReportFilterInput,
  InventoryReportFilterInput,
  MovementReportFilterInput,
  ReportDateRangeInput,
  SalesReportFilterInput,
} from "@allshops/contracts";
import type { TenantContext } from "./security.types.js";

const DAY = 86_400_000;
const quantity = (value: { toString(): string }) => Number(value.toString());
const percentage = (part: number, whole: number) =>
  whole === 0 ? 0 : Math.round((part / whole) * 10_000) / 100;

export function neutralizeCsvFormula(value: unknown): string {
  const text = value == null ? "" : String(value);
  // Preserve the visible value while forcing spreadsheet programs to treat
  // user-controlled formula prefixes as text (including leading whitespace).
  return /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
}

export function csv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "\uFEFF";
  const headers = Object.keys(rows[0]!);
  const cell = (value: unknown) =>
    `"${neutralizeCsvFormula(value).replaceAll('"', '""')}"`;
  return `\uFEFF${headers.map(cell).join(",")}\r\n${rows
    .map((row) => headers.map((header) => cell(row[header])).join(","))
    .join("\r\n")}\r\n`;
}

@Injectable()
export class ReportsService {
  private readonly exportLimit = Math.max(
    1,
    Number.parseInt(process.env.REPORT_EXPORT_MAX_ROWS ?? "50000", 10) ||
      50_000,
  );
  private readonly maxRangeDays = Math.max(
    1,
    Number.parseInt(process.env.REPORT_MAX_RANGE_DAYS ?? "366", 10) || 366,
  );

  private async branchScope(tenant: TenantContext, requested?: string) {
    if (tenant.branchId && requested && requested !== tenant.branchId) {
      throw new ForbiddenException({
        code: "BRANCH_FORBIDDEN",
        message: "You cannot report on this branch.",
      });
    }
    const branchId = tenant.branchId ?? requested;
    if (branchId) {
      const exists = await prisma.branch.count({
        where: {
          id: branchId,
          organizationId: tenant.organizationId,
          isActive: true,
        },
      });
      if (!exists)
        throw new NotFoundException({
          code: "BRANCH_NOT_FOUND",
          message: "Branch not found.",
        });
    }
    return branchId;
  }

  private range(input: ReportDateRangeInput, fallbackDays = 30) {
    const to = input.dateTo
      ? new Date(input.dateTo.getTime() + DAY)
      : new Date();
    const from = input.dateFrom
      ? input.dateFrom
      : new Date(to.getTime() - fallbackDays * DAY);
    if (to <= from)
      throw new BadRequestException({
        code: "INVALID_REPORT_RANGE",
        message: "dateTo must be on or after dateFrom.",
      });
    if (to.getTime() - from.getTime() > this.maxRangeDays * DAY)
      throw new BadRequestException({
        code: "REPORT_RANGE_TOO_LARGE",
        message: `Report range cannot exceed ${this.maxRangeDays} days.`,
      });
    return { from, to };
  }

  private async completedSales(
    tenant: TenantContext,
    input: SalesReportFilterInput,
  ) {
    const branchId = await this.branchScope(tenant, input.branchId);
    const { from, to } = this.range(input);
    return prisma.sale.findMany({
      where: {
        organizationId: tenant.organizationId,
        status: "COMPLETED",
        completedAt: { gte: from, lt: to },
        ...(branchId ? { branchId } : {}),
        ...(input.cashierId ? { createdBy: input.cashierId } : {}),
        ...(input.paymentMethod
          ? {
              payments: {
                some: { method: input.paymentMethod, status: "RECORDED" },
              },
            }
          : {}),
        ...(input.productId || input.categoryId || input.brandId
          ? {
              items: {
                some: {
                  ...(input.productId ? { productId: input.productId } : {}),
                  ...(input.categoryId
                    ? { product: { categoryId: input.categoryId } }
                    : {}),
                  ...(input.brandId
                    ? { product: { brandId: input.brandId } }
                    : {}),
                },
              },
            }
          : {}),
      },
      include: {
        branch: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        items: {
          include: {
            product: {
              select: {
                type: true,
                category: { select: { id: true, name: true } },
                brand: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { completedAt: "asc" },
    });
  }

  private matchingItems<
    T extends {
      productId: string;
      product: {
        category: { id: string } | null;
        brand: { id: string } | null;
      };
    },
  >(items: T[], input: SalesReportFilterInput): T[] {
    return items.filter(
      (item) =>
        (!input.productId || item.productId === input.productId) &&
        (!input.categoryId || item.product.category?.id === input.categoryId) &&
        (!input.brandId || item.product.brand?.id === input.brandId),
    );
  }

  async sales(tenant: TenantContext, input: SalesReportFilterInput) {
    const sales = await this.completedSales(tenant, input);
    const lineFiltered = Boolean(
      input.productId || input.categoryId || input.brandId,
    );
    const reportItems = sales.flatMap((sale) =>
      this.matchingItems(sale.items, input),
    );
    const grossSalesMinor = lineFiltered
      ? reportItems.reduce((sum, item) => sum + item.grossMinor, 0)
      : sales.reduce((sum, sale) => sum + sale.subtotalMinor, 0);
    const discountMinor = lineFiltered
      ? reportItems.reduce((sum, item) => sum + item.discountMinor, 0)
      : sales.reduce((sum, sale) => sum + sale.discountMinor, 0);
    const taxMinor = lineFiltered
      ? reportItems.reduce((sum, item) => sum + item.taxMinor, 0)
      : sales.reduce((sum, sale) => sum + sale.taxMinor, 0);
    const netSalesMinor = lineFiltered
      ? reportItems.reduce((sum, item) => sum + item.totalMinor, 0)
      : sales.reduce((sum, sale) => sum + sale.totalMinor, 0);
    const itemsSoldQuantity = sales.reduce(
      (sum, sale) =>
        sum +
        this.matchingItems(sale.items, input).reduce(
          (line, item) => line + quantity(item.quantity),
          0,
        ),
      0,
    );
    return {
      period: this.period(input),
      completedSalesCount: sales.length,
      grossSalesMinor,
      discountMinor,
      taxMinor,
      netSalesMinor,
      averageSaleMinor: sales.length
        ? Math.round(netSalesMinor / sales.length)
        : 0,
      itemsSoldQuantity,
    };
  }

  async profit(tenant: TenantContext, input: SalesReportFilterInput) {
    const sales = await this.completedSales(tenant, input);
    let netRevenueMinor = 0;
    let historicalCostMinor = 0;
    for (const sale of sales) {
      for (const item of this.matchingItems(sale.items, input)) {
        netRevenueMinor += item.totalMinor;
        historicalCostMinor += Math.round(
          item.unitCostMinor * quantity(item.quantity),
        );
      }
    }
    const grossProfitMinor = netRevenueMinor - historicalCostMinor;
    return {
      period: this.period(input),
      netRevenueMinor,
      historicalCostMinor,
      grossProfitMinor,
      grossMarginPercent: percentage(grossProfitMinor, netRevenueMinor),
      costSource: "SALE_ITEM_SNAPSHOT" as const,
    };
  }

  async salesGroups(
    tenant: TenantContext,
    input: SalesReportFilterInput,
    groupBy: "products" | "categories" | "brands" | "branches" | "cashiers",
    includeCost: boolean,
  ) {
    const sales = await this.completedSales(tenant, input);
    const groups = new Map<string, Record<string, string | number>>();
    const add = (
      key: string,
      name: string,
      revenue: number,
      cost: number,
      qty: number,
      saleId: string,
    ) => {
      const current = groups.get(key) ?? {
        id: key,
        name,
        quantity: 0,
        transactions: 0,
        netSalesMinor: 0,
        historicalCostMinor: 0,
        grossProfitMinor: 0,
        _sales: "",
      };
      const ids = new Set(String(current._sales).split(",").filter(Boolean));
      ids.add(saleId);
      current._sales = [...ids].join(",");
      current.transactions = ids.size;
      current.quantity = Number(current.quantity) + qty;
      current.netSalesMinor = Number(current.netSalesMinor) + revenue;
      current.historicalCostMinor = Number(current.historicalCostMinor) + cost;
      current.grossProfitMinor =
        Number(current.grossProfitMinor) + revenue - cost;
      groups.set(key, current);
    };
    for (const sale of sales) {
      if (groupBy === "branches" || groupBy === "cashiers") {
        const target = groupBy === "branches" ? sale.branch : sale.creator;
        const items = this.matchingItems(sale.items, input);
        const cost = items.reduce(
          (sum, item) =>
            sum + Math.round(item.unitCostMinor * quantity(item.quantity)),
          0,
        );
        add(
          target.id,
          target.name,
          input.productId || input.categoryId || input.brandId
            ? items.reduce((sum, item) => sum + item.totalMinor, 0)
            : sale.totalMinor,
          cost,
          items.reduce((sum, item) => sum + quantity(item.quantity), 0),
          sale.id,
        );
        continue;
      }
      for (const item of this.matchingItems(sale.items, input)) {
        const target =
          groupBy === "products"
            ? {
                id: `${item.productId}:${item.variantId ?? ""}`,
                name: item.variantNameSnapshot
                  ? `${item.productNameSnapshot} — ${item.variantNameSnapshot}`
                  : item.productNameSnapshot,
              }
            : groupBy === "brands"
              ? (item.product.brand ?? {
                  id: "unbranded",
                  name: "Unbranded",
                })
              : (item.product.category ?? {
                  id: "uncategorized",
                  name: "Uncategorized",
                });
        add(
          target.id,
          target.name,
          item.totalMinor,
          Math.round(item.unitCostMinor * quantity(item.quantity)),
          quantity(item.quantity),
          sale.id,
        );
      }
    }
    return [...groups.values()].map((row) => ({
      id: row.id,
      name: row.name,
      quantity: row.quantity,
      transactions: row.transactions,
      netSalesMinor: row.netSalesMinor,
      averageSaleMinor: Number(row.transactions)
        ? Math.round(Number(row.netSalesMinor) / Number(row.transactions))
        : 0,
      ...(includeCost
        ? {
            historicalCostMinor: row.historicalCostMinor,
            grossProfitMinor: row.grossProfitMinor,
            grossMarginPercent: percentage(
              Number(row.grossProfitMinor),
              Number(row.netSalesMinor),
            ),
          }
        : {}),
    }));
  }

  async discounts(tenant: TenantContext, input: SalesReportFilterInput) {
    const sales = await this.completedSales(tenant, input);
    const byCashier = new Map<
      string,
      { id: string; name: string; amountMinor: number; sales: number }
    >();
    const byBranch = new Map<
      string,
      { id: string; name: string; amountMinor: number; sales: number }
    >();
    for (const sale of sales.filter((row) => row.discountMinor > 0)) {
      for (const [map, target] of [
        [byCashier, sale.creator],
        [byBranch, sale.branch],
      ] as const) {
        const row = map.get(target.id) ?? {
          id: target.id,
          name: target.name,
          amountMinor: 0,
          sales: 0,
        };
        row.amountMinor += sale.discountMinor;
        row.sales += 1;
        map.set(target.id, row);
      }
    }
    return {
      totalDiscountMinor: sales.reduce(
        (sum, sale) => sum + sale.discountMinor,
        0,
      ),
      salesWithDiscount: sales.filter((sale) => sale.discountMinor > 0).length,
      byCashier: [...byCashier.values()],
      byBranch: [...byBranch.values()],
    };
  }

  async salesTrend(tenant: TenantContext, input: SalesReportFilterInput) {
    const sales = await this.completedSales(tenant, input);
    const days = new Map<
      string,
      { date: string; transactions: number; netSalesMinor: number }
    >();
    for (const sale of sales) {
      const key = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Qatar",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(sale.completedAt!);
      const row = days.get(key) ?? {
        date: key,
        transactions: 0,
        netSalesMinor: 0,
      };
      row.transactions += 1;
      row.netSalesMinor += sale.totalMinor;
      days.set(key, row);
    }
    return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  async payments(tenant: TenantContext, input: ReportDateRangeInput) {
    const branchId = await this.branchScope(tenant, input.branchId);
    const { from, to } = this.range(input);
    const records = await prisma.payment.groupBy({
      by: ["method"],
      where: {
        organizationId: tenant.organizationId,
        status: "RECORDED",
        recordedAt: { gte: from, lt: to },
        sale: { status: "COMPLETED", ...(branchId ? { branchId } : {}) },
      },
      _count: { _all: true },
      _sum: { amountMinor: true },
    });
    const refunds = await prisma.saleRefund.groupBy({
      by: ["method"],
      where: { organizationId: tenant.organizationId, status: "COMPLETED", createdAt: { gte: from, lt: to }, sale: { status: "COMPLETED", ...(branchId ? { branchId } : {}) } },
      _count: { _all: true },
      _sum: { amountMinor: true },
    });
    const refundByMethod = new Map(refunds.map((row) => [row.method, row]));
    const collectedMinor = records.reduce(
      (sum, row) => sum + (row._sum.amountMinor ?? 0),
      0,
    ) - refunds.reduce((sum, row) => sum + (row._sum.amountMinor ?? 0), 0);
    const methods = [...new Set([...records.map((row) => row.method), ...refunds.map((row) => row.method)])].map((method) => {
      const payment = records.find((row) => row.method === method);
      const refund = refundByMethod.get(method);
      return { method, transactionCount: (payment?._count._all ?? 0) - (refund?._count._all ?? 0), amountMinor: (payment?._sum.amountMinor ?? 0) - (refund?._sum.amountMinor ?? 0), percentage: percentage((payment?._sum.amountMinor ?? 0) - (refund?._sum.amountMinor ?? 0), collectedMinor) };
    });
    return {
      period: this.period(input),
      collectedMinor,
      // Only actual Payment rows are counted. Sale.balanceMinor (credit) and
      // tenderedMinor (cash before change) are intentionally excluded.
      methods,
    };
  }

  async inventory(
    tenant: TenantContext,
    input: InventoryReportFilterInput,
    includeValuation: boolean,
  ) {
    const branchId = await this.branchScope(tenant, input.branchId);
    const balances = await prisma.inventoryBalance.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...(branchId ? { branchId } : {}),
        ...(input.productId ? { productId: input.productId } : {}),
        ...(input.locationId ? { locationId: input.locationId } : {}),
        ...(input.categoryId || input.brandId
          ? {
              product: {
                ...(input.categoryId ? { categoryId: input.categoryId } : {}),
                ...(input.brandId ? { brandId: input.brandId } : {}),
              },
            }
          : {}),
      },
      include: {
        branch: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        product: {
          select: {
            id: true,
            name: true,
            type: true,
            trackInventory: true,
            minimumStock: true,
            costMinor: true,
          },
        },
        variant: { select: { id: true, name: true, costMinor: true } },
      },
      orderBy: [{ branch: { name: "asc" } }, { product: { name: "asc" } }],
    });
    const rows = balances.map((row) => {
      const onHand = quantity(row.quantity);
      const minimum = row.product.minimumStock
        ? quantity(row.product.minimumStock)
        : 0;
      const unitCostMinor = row.variant?.costMinor ?? row.product.costMinor;
      return {
        branchId: row.branch.id,
        branch: row.branch.name,
        locationId: row.location.id,
        location: row.location.name,
        productId: row.product.id,
        product: row.product.name,
        variant: row.variant?.name ?? null,
        quantity: onHand,
        minimumStock: minimum,
        lowStock:
          row.product.type === "STOCK_ITEM" &&
          row.product.trackInventory &&
          minimum > 0 &&
          onHand <= minimum,
        outOfStock:
          row.product.type === "STOCK_ITEM" &&
          row.product.trackInventory &&
          onHand <= 0,
        ...(includeValuation
          ? { unitCostMinor, valueMinor: Math.round(onHand * unitCostMinor) }
          : {}),
      };
    });
    return rows.filter(
      (row) =>
        (!input.lowStockOnly || row.lowStock) &&
        (!input.outOfStockOnly || row.outOfStock),
    );
  }

  async movements(tenant: TenantContext, input: MovementReportFilterInput) {
    const branchId = await this.branchScope(tenant, input.branchId);
    const { from, to } = this.range(input);
    return prisma.stockMovement.findMany({
      where: {
        organizationId: tenant.organizationId,
        occurredAt: { gte: from, lt: to },
        ...(branchId ? { branchId } : {}),
        ...(input.productId ? { productId: input.productId } : {}),
        ...(input.movementType ? { movementType: input.movementType } : {}),
      },
      select: {
        id: true,
        occurredAt: true,
        movementType: true,
        quantity: true,
        unitCostMinor: true,
        referenceType: true,
        referenceId: true,
        branch: { select: { name: true } },
        location: { select: { name: true } },
        product: { select: { name: true } },
        variant: { select: { name: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: this.exportLimit + 1,
    });
  }

  async slowMoving(tenant: TenantContext, input: InventoryReportFilterInput) {
    const branchId = await this.branchScope(tenant, input.branchId);
    const balances = await this.inventory(tenant, input, true);
    const productIds = [...new Set(balances.map((row) => row.productId))];
    if (productIds.length === 0) return [];
    const sold = await prisma.saleItem.groupBy({
      by: ["productId"],
      where: {
        organizationId: tenant.organizationId,
        productId: { in: productIds },
        sale: {
          status: "COMPLETED",
          ...(branchId ? { branchId } : {}),
        },
      },
      _max: { createdAt: true },
    });
    const lastSold = new Map(
      sold.map((row) => [row.productId, row._max.createdAt]),
    );
    const now = Date.now();
    const byProduct = new Map<
      string,
      {
        productId: string;
        product: string;
        quantity: number;
        estimatedValueMinor: number;
        lastSoldAt: Date | null;
        daysSinceLastSale: number | null;
      }
    >();
    for (const row of balances) {
      const previous = byProduct.get(row.productId);
      const soldAt = lastSold.get(row.productId) ?? null;
      const days = soldAt ? Math.floor((now - soldAt.getTime()) / DAY) : null;
      const current = previous ?? {
        productId: row.productId,
        product: row.product,
        quantity: 0,
        estimatedValueMinor: 0,
        lastSoldAt: soldAt,
        daysSinceLastSale: days,
      };
      current.quantity += row.quantity;
      current.estimatedValueMinor += row.valueMinor ?? 0;
      byProduct.set(row.productId, current);
    }
    return [...byProduct.values()].filter(
      (row) =>
        row.quantity > 0 &&
        (row.daysSinceLastSale == null ||
          row.daysSinceLastSale >= input.slowMovingDays),
    );
  }

  async purchases(tenant: TenantContext, input: ReportDateRangeInput) {
    const branchId = await this.branchScope(tenant, input.branchId);
    const { from, to } = this.range(input);
    const rows = await prisma.purchase.findMany({
      where: {
        organizationId: tenant.organizationId,
        status: { in: ["RECEIVED", "PARTIALLY_RECEIVED"] },
        purchaseDate: { gte: from, lt: to },
        ...(branchId ? { branchId } : {}),
      },
      include: { branch: true, supplier: true },
    });
    return {
      purchases: rows,
      totalMinor: rows.reduce((sum, row) => sum + row.totalMinor, 0),
      paidMinor: rows.reduce((sum, row) => sum + row.paidMinor, 0),
      outstandingMinor: rows.reduce((sum, row) => sum + row.balanceMinor, 0),
    };
  }

  async purchaseProducts(tenant: TenantContext, input: ReportDateRangeInput) {
    const branchId = await this.branchScope(tenant, input.branchId);
    const { from, to } = this.range(input);
    const grouped = await prisma.purchaseItem.groupBy({
      by: ["productId"],
      where: {
        organizationId: tenant.organizationId,
        purchase: {
          status: { in: ["RECEIVED", "PARTIALLY_RECEIVED"] },
          purchaseDate: { gte: from, lt: to },
          ...(branchId ? { branchId } : {}),
        },
      },
      _sum: { receivedQuantity: true, totalMinor: true },
      _avg: { unitCostMinor: true },
      _max: { unitCostMinor: true },
    });
    const names = await prisma.product.findMany({
      where: {
        organizationId: tenant.organizationId,
        id: { in: grouped.map((row) => row.productId) },
      },
      select: { id: true, name: true },
    });
    const nameById = new Map(names.map((row) => [row.id, row.name]));
    return grouped.map((row) => ({
      productId: row.productId,
      product: nameById.get(row.productId) ?? "Unknown product",
      quantityPurchased: row._sum.receivedQuantity
        ? quantity(row._sum.receivedQuantity)
        : 0,
      averageUnitCostMinor: Math.round(row._avg.unitCostMinor ?? 0),
      latestCostMinor: row._max.unitCostMinor ?? 0,
      totalPurchaseValueMinor: row._sum.totalMinor ?? 0,
    }));
  }

  async expenses(tenant: TenantContext, input: ReportDateRangeInput) {
    const branchId = await this.branchScope(tenant, input.branchId);
    const { from, to } = this.range(input);
    const rows = await prisma.expense.findMany({
      where: {
        organizationId: tenant.organizationId,
        status: "RECORDED",
        expenseDate: { gte: from, lt: to },
        ...(branchId ? { branchId } : {}),
      },
      include: { branch: true, category: true },
      orderBy: { expenseDate: "desc" },
    });
    const group = (key: "category" | "branch" | "paymentMethod") => {
      const grouped = new Map<
        string,
        { name: string; count: number; amountMinor: number }
      >();
      for (const row of rows) {
        const name =
          key === "category"
            ? row.category.name
            : key === "branch"
              ? row.branch.name
              : row.paymentMethod;
        const current = grouped.get(name) ?? { name, count: 0, amountMinor: 0 };
        current.count += 1;
        current.amountMinor += row.amountMinor;
        grouped.set(name, current);
      }
      return [...grouped.values()];
    };
    return {
      rows,
      count: rows.length,
      totalMinor: rows.reduce((sum, row) => sum + row.amountMinor, 0),
      byCategory: group("category"),
      byBranch: group("branch"),
      byPaymentMethod: group("paymentMethod"),
    };
  }

  async customers(tenant: TenantContext, input: ReportDateRangeInput = {}) {
    const branchId = await this.branchScope(tenant, input.branchId);
    return prisma.customer
      .findMany({
        where: { organizationId: tenant.organizationId, isActive: true },
        select: {
          id: true,
          name: true,
          creditLimitMinor: true,
          balanceMinor: true,
          sales: {
            where: { status: "COMPLETED", ...(branchId ? { branchId } : {}) },
            select: { completedAt: true, balanceMinor: true },
            orderBy: { completedAt: "desc" },
          },
          payments: {
            where: branchId
              ? { allocations: { some: { sale: { branchId } } } }
              : {},
            select: { paidAt: true },
            orderBy: { paidAt: "desc" },
            take: 1,
          },
        },
        orderBy: { name: "asc" },
      })
      .then((rows) =>
        rows.map((row) => {
          const outstandingMinor = branchId
            ? row.sales.reduce((sum, sale) => sum + sale.balanceMinor, 0)
            : row.balanceMinor;
          return {
            id: row.id,
            name: row.name,
            outstandingMinor,
            creditLimitMinor: row.creditLimitMinor,
            availableCreditMinor:
              row.creditLimitMinor == null
                ? null
                : Math.max(0, row.creditLimitMinor - outstandingMinor),
            lastSaleAt: row.sales[0]?.completedAt ?? null,
            lastPaymentAt: row.payments[0]?.paidAt ?? null,
          };
        }),
      );
  }

  async suppliers(tenant: TenantContext, input: ReportDateRangeInput = {}) {
    const branchId = await this.branchScope(tenant, input.branchId);
    const suppliers = await prisma.supplier.findMany({
      where: { organizationId: tenant.organizationId, isActive: true },
      select: {
        id: true,
        name: true,
        purchases: {
          where: {
            status: { in: ["RECEIVED", "PARTIALLY_RECEIVED"] },
            ...(branchId ? { branchId } : {}),
          },
          select: { balanceMinor: true },
        },
      },
      orderBy: { name: "asc" },
    });
    return suppliers.map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      balanceMinor: supplier.purchases.reduce(
        (sum, purchase) => sum + purchase.balanceMinor,
        0,
      ),
    }));
  }

  async appointments(
    tenant: TenantContext,
    userId: string,
    input: ReportDateRangeInput,
  ) {
    const branchId = await this.branchScope(tenant, input.branchId);
    const { from, to } = this.range(input);
    let staffProfileId: string | undefined;
    if (!tenant.permissions.includes("appointment.read_all")) {
      const own = await prisma.staffProfile.findFirst({
        where: { organizationId: tenant.organizationId, userId },
        select: { id: true },
      });
      if (!own)
        throw new ForbiddenException({
          code: "STAFF_PROFILE_REQUIRED",
          message: "A linked staff profile is required.",
        });
      staffProfileId = own.id;
    }
    const grouped = await prisma.appointment.groupBy({
      by: ["status"],
      where: {
        organizationId: tenant.organizationId,
        startAt: { gte: from, lt: to },
        ...(branchId ? { branchId } : {}),
        ...(staffProfileId
          ? {
              OR: [
                { primaryStaffProfileId: staffProfileId },
                { services: { some: { staffProfileId } } },
              ],
            }
          : {}),
      },
      _count: { _all: true },
    });
    return {
      period: this.period(input),
      statuses: grouped.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
    };
  }

  async commissions(
    tenant: TenantContext,
    userId: string,
    input: CommissionReportFilterInput,
  ) {
    const branchId = await this.branchScope(tenant, input.branchId);
    const { from, to } = this.range(input);
    let staffProfileId = input.staffProfileId;
    const all = tenant.permissions.includes("commission.read_all");
    if (!all) {
      const own = await prisma.staffProfile.findFirst({
        where: { organizationId: tenant.organizationId, userId },
        select: { id: true },
      });
      if (!own)
        throw new ForbiddenException({
          code: "STAFF_PROFILE_REQUIRED",
          message: "A linked staff profile is required.",
        });
      if (staffProfileId && staffProfileId !== own.id)
        throw new ForbiddenException({
          code: "COMMISSION_SCOPE_FORBIDDEN",
          message: "You can only report on your own commissions.",
        });
      staffProfileId = own.id;
    }
    const rows = await prisma.commission.findMany({
      where: {
        organizationId: tenant.organizationId,
        status: "EARNED",
        earnedAt: { gte: from, lt: to },
        ...(branchId ? { branchId } : {}),
        ...(staffProfileId ? { staffProfileId } : {}),
      },
      include: {
        staffProfile: { select: { displayName: true } },
        branch: { select: { name: true } },
      },
      orderBy: { earnedAt: "desc" },
    });
    return {
      rows,
      totalMinor: rows.reduce((sum, row) => sum + row.commissionAmountMinor, 0),
    };
  }

  async staffPerformance(
    tenant: TenantContext,
    userId: string,
    input: CommissionReportFilterInput,
  ) {
    const branchId = await this.branchScope(tenant, input.branchId);
    const { from, to } = this.range(input);
    let staffProfileId = input.staffProfileId;
    if (!tenant.permissions.includes("commission.read_all")) {
      const own = await prisma.staffProfile.findFirst({
        where: { organizationId: tenant.organizationId, userId },
        select: { id: true },
      });
      if (!own || (staffProfileId && staffProfileId !== own.id))
        throw new ForbiddenException({
          code: "STAFF_REPORT_SCOPE_FORBIDDEN",
          message: "You can only report on your own performance.",
        });
      staffProfileId = own.id;
    }
    const common = {
      organizationId: tenant.organizationId,
      ...(branchId ? { branchId } : {}),
      ...(staffProfileId ? { staffProfileId } : {}),
    };
    const [profiles, appointments, revenue, commissions] = await Promise.all([
      prisma.staffProfile.findMany({
        where: {
          organizationId: tenant.organizationId,
          ...(staffProfileId ? { id: staffProfileId } : {}),
        },
        select: { id: true, displayName: true },
      }),
      prisma.appointment.groupBy({
        by: ["primaryStaffProfileId", "status"],
        where: {
          organizationId: tenant.organizationId,
          startAt: { gte: from, lt: to },
          ...(branchId ? { branchId } : {}),
          ...(staffProfileId ? { primaryStaffProfileId: staffProfileId } : {}),
        },
        _count: { _all: true },
      }),
      prisma.saleItem.groupBy({
        by: ["staffProfileId"],
        where: {
          organizationId: tenant.organizationId,
          staffProfileId: staffProfileId ? staffProfileId : { not: null },
          sale: {
            status: "COMPLETED",
            completedAt: { gte: from, lt: to },
            ...(branchId ? { branchId } : {}),
          },
        },
        _sum: { totalMinor: true },
        _count: { saleId: true },
      }),
      prisma.commission.groupBy({
        by: ["staffProfileId"],
        where: {
          ...common,
          status: "EARNED",
          earnedAt: { gte: from, lt: to },
        },
        _sum: { commissionAmountMinor: true },
      }),
    ]);
    return profiles.map((profile) => ({
      staffProfileId: profile.id,
      staff: profile.displayName,
      completedAppointments: appointments
        .filter(
          (row) =>
            row.primaryStaffProfileId === profile.id &&
            row.status === "COMPLETED",
        )
        .reduce((sum, row) => sum + row._count._all, 0),
      noShows: appointments
        .filter(
          (row) =>
            row.primaryStaffProfileId === profile.id &&
            row.status === "NO_SHOW",
        )
        .reduce((sum, row) => sum + row._count._all, 0),
      serviceRevenueMinor:
        revenue.find((row) => row.staffProfileId === profile.id)?._sum
          .totalMinor ?? 0,
      salesLineCount:
        revenue.find((row) => row.staffProfileId === profile.id)?._count
          .saleId ?? 0,
      earnedCommissionMinor:
        commissions.find((row) => row.staffProfileId === profile.id)?._sum
          .commissionAmountMinor ?? 0,
    }));
  }

  async dashboard(
    tenant: TenantContext,
    userId: string,
    input: ReportDateRangeInput,
  ) {
    const salesInput: SalesReportFilterInput = { ...input };
    const [
      sales,
      profit,
      expenses,
      customers,
      suppliers,
      inventory,
      appointments,
    ] = await Promise.all([
      tenant.permissions.includes("report.sales")
        ? this.sales(tenant, salesInput)
        : null,
      tenant.permissions.includes("report.profit")
        ? this.profit(tenant, salesInput)
        : null,
      tenant.permissions.includes("report.expenses")
        ? this.expenses(tenant, input)
        : null,
      tenant.permissions.includes("report.customer_balances")
        ? this.customers(tenant, input)
        : null,
      tenant.permissions.includes("report.suppliers")
        ? this.suppliers(tenant, input)
        : null,
      tenant.permissions.includes("report.inventory")
        ? this.inventory(
            tenant,
            { branchId: input.branchId, slowMovingDays: 30 },
            false,
          )
        : null,
      tenant.permissions.includes("report.appointments")
        ? this.appointments(tenant, userId, input)
        : null,
    ]);
    return {
      period: this.period(input),
      ...(sales ? { sales } : {}),
      ...(profit ? { grossProfit: profit } : {}),
      ...(expenses ? { expenses: { totalMinor: expenses.totalMinor } } : {}),
      ...(customers
        ? {
            receivables: {
              customerOutstandingMinor: customers.reduce(
                (s, r) => s + r.outstandingMinor,
                0,
              ),
            },
          }
        : {}),
      ...(suppliers
        ? {
            payables: {
              supplierOutstandingMinor: suppliers.reduce(
                (s, r) => s + r.balanceMinor,
                0,
              ),
            },
          }
        : {}),
      ...(inventory
        ? {
            inventory: {
              lowStockCount: inventory.filter((r) => r.lowStock).length,
            },
          }
        : {}),
      ...(appointments ? { appointments } : {}),
    };
  }

  async exportRows(
    reportType: string,
    tenant: TenantContext,
    userId: string,
    input: ReportDateRangeInput,
  ) {
    const required: Record<string, string> = {
      sales: "report.sales",
      "sales-products": "report.sales",
      inventory: "report.inventory",
      "inventory-movements": "report.inventory",
      purchases: "report.purchases",
      expenses: "report.expenses",
      "customer-balances": "report.customer_balances",
      "supplier-balances": "report.suppliers",
      commissions: "report.commissions",
    };
    const underlying = required[reportType];
    if (!underlying || !tenant.permissions.includes(underlying))
      throw new ForbiddenException({
        code: "REPORT_EXPORT_FORBIDDEN",
        message: "You cannot export this report.",
      });
    let rows: Array<Record<string, unknown>>;
    if (reportType === "sales") {
      const report = await this.sales(tenant, input);
      rows = [
        { metric: "Completed sales", value: report.completedSalesCount },
        { metric: "Gross sales (minor)", value: report.grossSalesMinor },
        { metric: "Discounts (minor)", value: report.discountMinor },
        { metric: "Tax (minor)", value: report.taxMinor },
        { metric: "Net sales (minor)", value: report.netSalesMinor },
      ];
    } else if (reportType === "sales-products") {
      rows = (await this.salesGroups(
        tenant,
        input,
        "products",
        tenant.permissions.includes("report.sales.cost"),
      )) as Array<Record<string, unknown>>;
    } else if (reportType === "inventory") {
      rows = (await this.inventory(
        tenant,
        { branchId: input.branchId, slowMovingDays: 30 },
        tenant.permissions.includes("report.inventory.valuation"),
      )) as Array<Record<string, unknown>>;
    } else if (reportType === "inventory-movements") {
      rows = (await this.movements(tenant, input)).map((row) => ({
        ...row,
        quantity: quantity(row.quantity),
      }));
    } else if (reportType === "purchases") {
      const result = await this.purchases(tenant, input);
      rows = result.purchases.map((row) => ({
        purchaseDate: row.purchaseDate.toISOString(),
        purchaseNumber: row.purchaseNumber,
        supplier: row.supplier.name,
        branch: row.branch.name,
        status: row.status,
        totalMinor: row.totalMinor,
        paidMinor: row.paidMinor,
        outstandingMinor: row.balanceMinor,
      }));
    } else if (reportType === "expenses") {
      const result = await this.expenses(tenant, input);
      rows = result.rows.map((row) => ({
        date: row.expenseDate.toISOString(),
        branch: row.branch.name,
        category: row.category.name,
        description: row.description,
        amountMinor: row.amountMinor,
      }));
    } else if (reportType === "customer-balances") {
      rows = (await this.customers(tenant, input)) as Array<
        Record<string, unknown>
      >;
    } else if (reportType === "supplier-balances") {
      rows = (await this.suppliers(tenant, input)) as Array<
        Record<string, unknown>
      >;
    } else if (reportType === "commissions") {
      const result = await this.commissions(tenant, userId, input);
      rows = result.rows.map((row) => ({
        earnedAt: row.earnedAt.toISOString(),
        staff: row.staffProfile.displayName,
        branch: row.branch.name,
        amountMinor: row.commissionAmountMinor,
      }));
    } else {
      throw new BadRequestException({
        code: "UNSUPPORTED_REPORT_EXPORT",
        message: "This report type cannot be exported.",
      });
    }
    if (rows.length > this.exportLimit)
      throw new BadRequestException({
        code: "REPORT_EXPORT_LIMIT_EXCEEDED",
        message: `Export exceeds ${this.exportLimit} rows; narrow the filters.`,
      });
    await prisma.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        userId,
        action: "REPORT_EXPORTED",
        entityType: "REPORT",
        entityId: reportType,
        afterJson: {
          reportType,
          format: "csv",
          dateFrom: input.dateFrom?.toISOString() ?? null,
          dateTo: input.dateTo?.toISOString() ?? null,
          branchId: tenant.branchId ?? input.branchId ?? null,
        },
      },
    });
    return csv(rows);
  }

  private period(input: ReportDateRangeInput) {
    const { from, to } = this.range(input);
    return {
      from: from.toISOString(),
      toExclusive: to.toISOString(),
      timezone: "Asia/Qatar",
    };
  }
}
