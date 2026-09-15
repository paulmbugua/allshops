import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@allshops/database";
import type {
  ReconciliationDateInput,
  SubmitReconciliationInput,
} from "@allshops/contracts";

import type { TenantContext } from "./security.types.js";

type CashierTotals = {
  cashierId: string;
  cashierName: string;
  employeeNumber: string | null;
  branchId: string;
  branchName: string;
  transactionCount: number;
  totalSalesMinor: number;
  expectedCashMinor: number;
  cardSalesMinor: number;
  otherPaymentsMinor: number;
  creditSalesMinor: number;
};

@Injectable()
export class ReconciliationService {
  async daily(
    tenant: TenantContext,
    userId: string,
    input: ReconciliationDateInput,
  ) {
    const branchId = await this.branchScope(tenant, input.branchId);
    const readAll = tenant.permissions.includes("reconciliation.read_all");
    const { from, to, businessDate } = this.day(input.date);
    const sales = await prisma.sale.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...(branchId ? { branchId } : {}),
        status: "COMPLETED",
        completedAt: { gte: from, lt: to },
        ...(!readAll ? { createdBy: userId } : {}),
      },
      select: {
        id: true,
        createdBy: true,
        totalMinor: true,
        balanceMinor: true,
        creator: { select: { name: true } },
        branch: { select: { id: true, name: true } },
        payments: {
          where: { status: "RECORDED" },
          select: { method: true, amountMinor: true },
        },
      },
    });
    const membershipRows = await prisma.organizationUser.findMany({
      where: {
        organizationId: tenant.organizationId,
        userId: { in: [...new Set(sales.map((sale) => sale.createdBy))] },
      },
      select: { userId: true, employeeNumber: true },
    });
    const employees = new Map(
      membershipRows.map((row) => [row.userId, row.employeeNumber]),
    );
    const groups = new Map<string, CashierTotals>();
    for (const sale of sales) {
      const key = `${sale.branch.id}:${sale.createdBy}`;
      const current = groups.get(key) ?? {
        cashierId: sale.createdBy,
        cashierName: sale.creator.name,
        employeeNumber: employees.get(sale.createdBy) ?? null,
        branchId: sale.branch.id,
        branchName: sale.branch.name,
        transactionCount: 0,
        totalSalesMinor: 0,
        expectedCashMinor: 0,
        cardSalesMinor: 0,
        otherPaymentsMinor: 0,
        creditSalesMinor: 0,
      };
      current.transactionCount += 1;
      current.totalSalesMinor += sale.totalMinor;
      current.creditSalesMinor += sale.balanceMinor;
      for (const payment of sale.payments) {
        if (payment.method === "CASH")
          current.expectedCashMinor += payment.amountMinor;
        else if (payment.method === "CARD")
          current.cardSalesMinor += payment.amountMinor;
        else current.otherPaymentsMinor += payment.amountMinor;
      }
      groups.set(key, current);
    }
    const reconciliations = await prisma.cashierReconciliation.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...(branchId ? { branchId } : {}),
        businessDate,
        ...(!readAll ? { cashierId: userId } : {}),
      },
    });
    const submitted = new Map(
      reconciliations.map((row) => [`${row.branchId}:${row.cashierId}`, row]),
    );
    for (const row of reconciliations) {
      const key = `${row.branchId}:${row.cashierId}`;
      if (!groups.has(key)) {
        const user = await prisma.user.findUniqueOrThrow({
          where: { id: row.cashierId },
          select: { name: true },
        });
        const branch = await prisma.branch.findUniqueOrThrow({
          where: { id: row.branchId },
          select: { name: true },
        });
        groups.set(key, {
          cashierId: row.cashierId,
          cashierName: user.name,
          employeeNumber: null,
          branchId: row.branchId,
          branchName: branch.name,
          transactionCount: row.transactionCount,
          totalSalesMinor: row.totalSalesMinor,
          expectedCashMinor: row.expectedCashMinor,
          cardSalesMinor: row.cardSalesMinor,
          otherPaymentsMinor: 0,
          creditSalesMinor: row.creditSalesMinor,
        });
      }
    }
    const rows = [...groups.values()]
      .map((row) => {
        const record = submitted.get(`${row.branchId}:${row.cashierId}`);
        return {
          ...row,
          reconciliationId: record?.id ?? null,
          countedCashMinor: record?.countedCashMinor ?? null,
          varianceMinor: record?.varianceMinor ?? null,
          status: record?.status ?? "PENDING",
          submittedAt: record?.submittedAt ?? null,
          approvedAt: record?.approvedAt ?? null,
          notes: record?.notes ?? null,
        };
      })
      .sort((a, b) => a.cashierName.localeCompare(b.cashierName));
    return {
      date: input.date,
      branchId,
      currentUserId: userId,
      rows,
      aggregate: rows.reduce(
        (sum, row) => ({
          transactionCount: sum.transactionCount + row.transactionCount,
          totalSalesMinor: sum.totalSalesMinor + row.totalSalesMinor,
          expectedCashMinor: sum.expectedCashMinor + row.expectedCashMinor,
          cardSalesMinor: sum.cardSalesMinor + row.cardSalesMinor,
          otherPaymentsMinor: sum.otherPaymentsMinor + row.otherPaymentsMinor,
          creditSalesMinor: sum.creditSalesMinor + row.creditSalesMinor,
          countedCashMinor: sum.countedCashMinor + (row.countedCashMinor ?? 0),
          varianceMinor: sum.varianceMinor + (row.varianceMinor ?? 0),
          submittedCount:
            sum.submittedCount + (row.status === "PENDING" ? 0 : 1),
        }),
        {
          transactionCount: 0,
          totalSalesMinor: 0,
          expectedCashMinor: 0,
          cardSalesMinor: 0,
          otherPaymentsMinor: 0,
          creditSalesMinor: 0,
          countedCashMinor: 0,
          varianceMinor: 0,
          submittedCount: 0,
        },
      ),
    };
  }

  async submit(
    tenant: TenantContext,
    userId: string,
    input: SubmitReconciliationInput,
  ) {
    const report = await this.daily(tenant, userId, {
      date: input.date,
      branchId: input.branchId,
    });
    const totals = report.rows.find((row) => row.cashierId === userId) ?? {
      transactionCount: 0,
      totalSalesMinor: 0,
      expectedCashMinor: 0,
      cardSalesMinor: 0,
      creditSalesMinor: 0,
    };
    const businessDate = this.day(input.date).businessDate;
    const varianceMinor = input.countedCashMinor - totals.expectedCashMinor;
    const record = await prisma.cashierReconciliation.upsert({
      where: {
        organizationId_branchId_cashierId_businessDate: {
          organizationId: tenant.organizationId,
          branchId: input.branchId,
          cashierId: userId,
          businessDate,
        },
      },
      update: {
        transactionCount: totals.transactionCount,
        totalSalesMinor: totals.totalSalesMinor,
        expectedCashMinor: totals.expectedCashMinor,
        cardSalesMinor: totals.cardSalesMinor,
        creditSalesMinor: totals.creditSalesMinor,
        countedCashMinor: input.countedCashMinor,
        varianceMinor,
        notes: input.notes,
        status: "SUBMITTED",
        submittedBy: userId,
        submittedAt: new Date(),
        approvedBy: null,
        approvedAt: null,
      },
      create: {
        organizationId: tenant.organizationId,
        branchId: input.branchId,
        cashierId: userId,
        businessDate,
        transactionCount: totals.transactionCount,
        totalSalesMinor: totals.totalSalesMinor,
        expectedCashMinor: totals.expectedCashMinor,
        cardSalesMinor: totals.cardSalesMinor,
        creditSalesMinor: totals.creditSalesMinor,
        countedCashMinor: input.countedCashMinor,
        varianceMinor,
        notes: input.notes,
        submittedBy: userId,
      },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        userId,
        action: "CASHIER_RECONCILIATION_SUBMITTED",
        entityType: "CashierReconciliation",
        entityId: record.id,
        afterJson: { businessDate: input.date, ...input, varianceMinor },
      },
    });
    return record;
  }

  async approve(tenant: TenantContext, userId: string, id: string) {
    const current = await prisma.cashierReconciliation.findFirst({
      where: {
        id,
        organizationId: tenant.organizationId,
        ...(tenant.branchId ? { branchId: tenant.branchId } : {}),
      },
    });
    if (!current)
      throw new NotFoundException({
        code: "RECONCILIATION_NOT_FOUND",
        message: "Cashier reconciliation not found.",
      });
    const record = await prisma.cashierReconciliation.update({
      where: { id },
      data: { status: "APPROVED", approvedBy: userId, approvedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        userId,
        action: "CASHIER_RECONCILIATION_APPROVED",
        entityType: "CashierReconciliation",
        entityId: id,
      },
    });
    return record;
  }

  private day(value: string) {
    const from = new Date(`${value}T00:00:00+03:00`);
    return {
      businessDate: new Date(`${value}T00:00:00.000Z`),
      from,
      to: new Date(from.getTime() + 86_400_000),
    };
  }

  private async branchScope(tenant: TenantContext, requested?: string) {
    if (tenant.branchId && requested && requested !== tenant.branchId)
      throw new ForbiddenException({
        code: "BRANCH_FORBIDDEN",
        message: "You cannot reconcile another branch.",
      });
    const branchId = tenant.branchId ?? requested ?? null;
    if (!branchId && !tenant.permissions.includes("reconciliation.read_all"))
      throw new ForbiddenException({
        code: "BRANCH_REQUIRED",
        message: "Choose a branch before reconciling sales.",
      });
    const exists = await prisma.branch.count({
      where: {
        organizationId: tenant.organizationId,
        isActive: true,
        ...(branchId ? { id: branchId } : {}),
      },
    });
    if (!exists)
      throw new NotFoundException({
        code: "BRANCH_NOT_FOUND",
        message: "Branch not found.",
      });
    return branchId;
  }
}
