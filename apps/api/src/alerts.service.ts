import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@allshops/database";
import type { AlertListInput } from "@allshops/contracts";
import type { TenantContext } from "./security.types.js";

@Injectable()
export class AlertsService {
  list(tenant: TenantContext, input: AlertListInput) {
    const where = { organizationId: tenant.organizationId, ...(tenant.branchId ? { OR: [{ branchId: tenant.branchId }, { branchId: null }] } : {}), ...(input.status ? { status: input.status } : {}) };
    return prisma.operationalAlert.findMany({ where, orderBy: [{ status: "asc" }, { createdAt: "desc" }], skip: (input.page - 1) * input.pageSize, take: input.pageSize });
  }

  async acknowledge(tenant: TenantContext, userId: string, id: string) {
    const alert = await prisma.operationalAlert.findFirst({ where: { id, organizationId: tenant.organizationId, ...(tenant.branchId ? { OR: [{ branchId: tenant.branchId }, { branchId: null }] } : {}) } });
    if (!alert) throw new NotFoundException({ code: "ALERT_NOT_FOUND", message: "Alert not found." });
    return prisma.$transaction(async (tx) => {
      const result = await tx.operationalAlert.update({ where: { id }, data: { status: "ACKNOWLEDGED", acknowledgedBy: userId, acknowledgedAt: new Date() } });
      await tx.auditLog.create({ data: { organizationId: tenant.organizationId, userId, action: "ALERT_ACKNOWLEDGED", entityType: "OperationalAlert", entityId: id } });
      return result;
    });
  }

  async resolve(tenant: TenantContext, userId: string, id: string) {
    const alert = await prisma.operationalAlert.findFirst({ where: { id, organizationId: tenant.organizationId, ...(tenant.branchId ? { OR: [{ branchId: tenant.branchId }, { branchId: null }] } : {}) } });
    if (!alert) throw new NotFoundException({ code: "ALERT_NOT_FOUND", message: "Alert not found." });
    return prisma.$transaction(async (tx) => {
      const result = await tx.operationalAlert.update({ where: { id }, data: { status: "RESOLVED", resolvedAt: new Date(), acknowledgedBy: alert.acknowledgedBy ?? userId, acknowledgedAt: alert.acknowledgedAt ?? new Date() } });
      await tx.auditLog.create({ data: { organizationId: tenant.organizationId, userId, action: "ALERT_RESOLVED", entityType: "OperationalAlert", entityId: id } });
      return result;
    });
  }
}
