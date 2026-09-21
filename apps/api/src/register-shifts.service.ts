import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, prisma } from "@allshops/database";
import type { CashMovementInput, CloseShiftInput, OpenShiftInput } from "@allshops/contracts";
import type { TenantContext } from "./security.types.js";

@Injectable()
export class RegisterShiftsService {
  private branch(tenant: TenantContext, branchId: string) {
    if (tenant.branchId && tenant.branchId !== branchId)
      throw new ForbiddenException({ code: "BRANCH_SCOPE", message: "This user is restricted to another branch." });
  }

  async open(tenant: TenantContext, userId: string, input: OpenShiftInput) {
    this.branch(tenant, input.branchId);
    const existing = await prisma.registerShift.findFirst({ where: { organizationId: tenant.organizationId, branchId: input.branchId, cashierId: userId, status: "OPEN" } });
    if (existing) throw new ConflictException({ code: "SHIFT_ALREADY_OPEN", message: "This cashier already has an open shift." });
    const shift = await prisma.registerShift.create({ data: { organizationId: tenant.organizationId, branchId: input.branchId, cashierId: userId, deviceId: input.deviceId, openingCashMinor: input.openingCashMinor, notes: input.notes, openedBy: userId } });
    await prisma.auditLog.create({ data: { organizationId: tenant.organizationId, userId, action: "REGISTER_SHIFT_OPENED", entityType: "RegisterShift", entityId: shift.id, afterJson: { openingCashMinor: input.openingCashMinor, branchId: input.branchId } } });
    return shift;
  }

  async movement(tenant: TenantContext, userId: string, shiftId: string, input: CashMovementInput) {
    const shift = await this.assertOpen(tenant, shiftId, userId);
    const movement = await prisma.cashMovement.create({ data: { shiftId: shift.id, type: input.type, amountMinor: input.amountMinor, reason: input.reason, createdBy: userId } });
    await prisma.auditLog.create({ data: { organizationId: tenant.organizationId, userId, action: "REGISTER_CASH_MOVEMENT", entityType: "CashMovement", entityId: movement.id, afterJson: { shiftId, type: input.type, amountMinor: input.amountMinor } } });
    return movement;
  }

  async close(tenant: TenantContext, userId: string, shiftId: string, input: CloseShiftInput) {
    const shift = await this.assertOpen(tenant, shiftId, userId);
    const closedAt = new Date();
    const sales = await prisma.sale.findMany({ where: { organizationId: tenant.organizationId, branchId: shift.branchId, createdBy: userId, status: "COMPLETED", completedAt: { gte: shift.openedAt, lte: closedAt } }, select: { payments: { where: { method: "CASH", status: "RECORDED" }, select: { amountMinor: true } } } });
    const cashSales = sales.reduce((sum, sale) => sum + sale.payments.reduce((subtotal, payment) => subtotal + payment.amountMinor, 0), 0);
    const refunds = await prisma.saleRefund.aggregate({ where: { organizationId: tenant.organizationId, branchId: shift.branchId, method: "CASH", status: "COMPLETED", createdAt: { gte: shift.openedAt, lte: closedAt }, sale: { createdBy: userId, status: "COMPLETED" } }, _sum: { amountMinor: true } });
    const cashRefunds = refunds._sum.amountMinor ?? 0;
    const movements = await prisma.cashMovement.findMany({ where: { shiftId: shift.id } });
    const cashIn = movements.filter((row) => row.type === "CASH_IN").reduce((sum, row) => sum + row.amountMinor, 0);
    const cashOut = movements.filter((row) => row.type === "CASH_OUT").reduce((sum, row) => sum + row.amountMinor, 0);
    const expectedCashMinor = shift.openingCashMinor + cashSales - cashRefunds + cashIn - cashOut;
    const varianceMinor = input.countedCashMinor - expectedCashMinor;
    const result = await prisma.registerShift.update({ where: { id: shift.id }, data: { status: "CLOSED", closedAt, closedBy: userId, countedCashMinor: input.countedCashMinor, expectedCashMinor, varianceMinor, notes: input.notes ?? shift.notes } });
    if (varianceMinor !== 0) {
      await prisma.operationalAlert.upsert({ where: { organizationId_dedupeKey: { organizationId: tenant.organizationId, dedupeKey: `CASH_VARIANCE:${shift.id}` } }, update: { status: "OPEN", message: `Register variance is ${varianceMinor} minor units.`, updatedAt: new Date() }, create: { organizationId: tenant.organizationId, branchId: shift.branchId, type: "CASH_VARIANCE", severity: Math.abs(varianceMinor) >= 5000 ? "CRITICAL" : "WARNING", status: "OPEN", title: "Register cash variance", message: `Register variance is ${varianceMinor} minor units.`, entityType: "RegisterShift", entityId: shift.id, dedupeKey: `CASH_VARIANCE:${shift.id}` } });
    }
    await prisma.auditLog.create({ data: { organizationId: tenant.organizationId, userId, action: "REGISTER_SHIFT_CLOSED", entityType: "RegisterShift", entityId: shift.id, afterJson: { expectedCashMinor, countedCashMinor: input.countedCashMinor, varianceMinor } } });
    return result;
  }

  async approve(tenant: TenantContext, userId: string, shiftId: string) {
    const shift = await prisma.registerShift.findFirst({ where: { id: shiftId, organizationId: tenant.organizationId, status: "CLOSED", ...(tenant.branchId ? { branchId: tenant.branchId } : {}) } });
    if (!shift) throw new NotFoundException({ code: "SHIFT_NOT_FOUND", message: "Closed register shift not found." });
    const result = await prisma.registerShift.update({ where: { id: shift.id }, data: { status: "APPROVED", approvedAt: new Date(), approvedBy: userId } });
    await prisma.auditLog.create({ data: { organizationId: tenant.organizationId, userId, action: "REGISTER_SHIFT_APPROVED", entityType: "RegisterShift", entityId: shift.id } });
    return result;
  }

  list(tenant: TenantContext) {
    return prisma.registerShift.findMany({ where: { organizationId: tenant.organizationId, ...(tenant.branchId ? { branchId: tenant.branchId } : {}) }, include: { branch: { select: { name: true } }, cashier: { select: { name: true } }, movements: true }, orderBy: { openedAt: "desc" }, take: 100 });
  }

  private async assertOpen(tenant: TenantContext, shiftId: string, userId: string) {
    const shift = await prisma.registerShift.findFirst({ where: { id: shiftId, organizationId: tenant.organizationId, cashierId: userId, status: "OPEN", ...(tenant.branchId ? { branchId: tenant.branchId } : {}) } });
    if (!shift) throw new NotFoundException({ code: "OPEN_SHIFT_NOT_FOUND", message: "No open register shift was found for this cashier." });
    return shift;
  }
}
