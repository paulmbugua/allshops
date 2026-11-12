import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, prisma } from "@allshops/database";
import type {
  FiscalDocumentListInput,
  RetryFiscalDocumentInput,
  UpsertEtimsBranchInput,
  UpsertEtimsIntegrationInput,
  UpsertEtimsProductMappingInput,
} from "@allshops/contracts";
import type { TenantContext } from "./security.types.js";
import { encryptEtimsSecret } from "./etims-crypto.js";

type Transaction = Prisma.TransactionClient;

@Injectable()
export class EtimsService {
  async overview(tenant: TenantContext) {
    const integration = await prisma.etimsIntegration.findUnique({
      where: { organizationId: tenant.organizationId },
      include: {
        branches: {
          include: { branch: { select: { id: true, name: true, code: true } } },
          orderBy: { branch: { name: "asc" } },
        },
      },
    });
    const [products, mappedProducts, pending, rejected] = await Promise.all([
      prisma.product.count({
        where: { organizationId: tenant.organizationId, isActive: true },
      }),
      prisma.etimsProductMapping.count({
        where: { organizationId: tenant.organizationId, isActive: true },
      }),
      prisma.fiscalDocument.count({
        where: {
          organizationId: tenant.organizationId,
          status: { in: ["PENDING", "SUBMITTING", "RETRY"] },
        },
      }),
      prisma.fiscalDocument.count({
        where: { organizationId: tenant.organizationId, status: "REJECTED" },
      }),
    ]);
    return {
      integration: integration ? this.safeIntegration(integration) : null,
      readiness: {
        products,
        mappedProducts,
        unmappedProducts: Math.max(0, products - mappedProducts),
        configuredBranches:
          integration?.branches.filter((row) => row.isActive).length ?? 0,
        initializedBranches:
          integration?.branches.filter(
            (row) => row.isActive && row.initializedAt,
          ).length ?? 0,
        pendingDocuments: pending,
        rejectedDocuments: rejected,
      },
    };
  }

  async upsertIntegration(
    tenant: TenantContext,
    userId: string,
    input: UpsertEtimsIntegrationInput,
  ) {
    const current = await prisma.etimsIntegration.findUnique({
      where: { organizationId: tenant.organizationId },
      include: { branches: true },
    });
    if (["SANDBOX", "CERTIFIED"].includes(input.status)) {
      const hasKey = Boolean(
        input.communicationKey || current?.communicationKeyCiphertext,
      );
      if (!hasKey)
        throw new BadRequestException({
          code: "ETIMS_COMMUNICATION_KEY_REQUIRED",
          message:
            "Add the KRA communication key before enabling fiscal submission.",
        });
      if (!current?.branches.some((row) => row.isActive && row.initializedAt))
        throw new BadRequestException({
          code: "ETIMS_BRANCH_NOT_READY",
          message:
            "Configure and initialize at least one KRA branch before enabling submission.",
        });
    }
    const encrypted = input.communicationKey
      ? encryptEtimsSecret(input.communicationKey)
      : null;
    const integration = await prisma.$transaction(async (tx) => {
      const saved = await tx.etimsIntegration.upsert({
        where: { organizationId: tenant.organizationId },
        create: {
          organizationId: tenant.organizationId,
          environment: input.environment,
          status: input.status,
          kraPin: input.kraPin,
          traderSystemName: input.traderSystemName,
          ...(encrypted
            ? {
                communicationKeyCiphertext: encrypted.ciphertext,
                communicationKeyIv: encrypted.iv,
                communicationKeyTag: encrypted.tag,
              }
            : {}),
        },
        update: {
          environment: input.environment,
          status: input.status,
          kraPin: input.kraPin,
          traderSystemName: input.traderSystemName,
          ...(encrypted
            ? {
                communicationKeyCiphertext: encrypted.ciphertext,
                communicationKeyIv: encrypted.iv,
                communicationKeyTag: encrypted.tag,
              }
            : {}),
        },
        include: { branches: true },
      });
      await this.audit(
        tx,
        tenant.organizationId,
        userId,
        "ETIMS_CONFIGURATION_UPDATED",
        saved.id,
        {
          environment: saved.environment,
          status: saved.status,
          kraPin: saved.kraPin,
          communicationKeyRotated: Boolean(input.communicationKey),
        },
      );
      return saved;
    });
    return this.safeIntegration(integration);
  }

  async upsertBranch(
    tenant: TenantContext,
    userId: string,
    input: UpsertEtimsBranchInput,
  ) {
    const integration = await prisma.etimsIntegration.findUnique({
      where: { organizationId: tenant.organizationId },
    });
    if (!integration)
      throw new ConflictException({
        code: "ETIMS_CONFIGURATION_REQUIRED",
        message: "Save the organization eTIMS configuration first.",
      });
    const branch = await prisma.branch.findFirst({
      where: { id: input.branchId, organizationId: tenant.organizationId },
      select: { id: true, name: true },
    });
    if (!branch)
      throw new NotFoundException({
        code: "BRANCH_NOT_FOUND",
        message: "Branch not found.",
      });
    const saved = await prisma.$transaction(async (tx) => {
      const row = await tx.etimsBranchConfig.upsert({
        where: { branchId: input.branchId },
        create: {
          integrationId: integration.id,
          branchId: input.branchId,
          kraBranchId: input.kraBranchId,
          deviceSerial: input.deviceSerial,
          isActive: input.isActive,
          initializedAt: input.initializedAt,
        },
        update: {
          kraBranchId: input.kraBranchId,
          deviceSerial: input.deviceSerial,
          isActive: input.isActive,
          initializedAt: input.initializedAt,
        },
      });
      await this.audit(
        tx,
        tenant.organizationId,
        userId,
        "ETIMS_BRANCH_CONFIGURED",
        row.id,
        {
          branchId: branch.id,
          kraBranchId: row.kraBranchId,
          initialized: Boolean(row.initializedAt),
        },
      );
      return row;
    });
    return { ...saved, branch };
  }

  async upsertProductMapping(
    tenant: TenantContext,
    userId: string,
    input: UpsertEtimsProductMappingInput,
  ) {
    const product = await prisma.product.findFirst({
      where: { id: input.productId, organizationId: tenant.organizationId },
      select: { id: true, name: true },
    });
    if (!product)
      throw new NotFoundException({
        code: "PRODUCT_NOT_FOUND",
        message: "Product not found.",
      });
    const mapping = await prisma.$transaction(async (tx) => {
      const row = await tx.etimsProductMapping.upsert({
        where: { productId: input.productId },
        create: { organizationId: tenant.organizationId, ...input },
        update: input,
      });
      await this.audit(
        tx,
        tenant.organizationId,
        userId,
        "ETIMS_PRODUCT_MAPPED",
        row.id,
        {
          productId: product.id,
          itemCode: row.itemCode,
          itemClassCode: row.itemClassCode,
          taxTypeCode: row.taxTypeCode,
          taxRateBps: row.taxRateBps,
        },
      );
      return row;
    });
    return { ...mapping, product };
  }

  async productMappings(tenant: TenantContext) {
    return prisma.product.findMany({
      where: { organizationId: tenant.organizationId, isActive: true },
      select: {
        id: true,
        name: true,
        sku: true,
        barcode: true,
        etimsMapping: true,
      },
      orderBy: { name: "asc" },
    });
  }

  async documents(tenant: TenantContext, input: FiscalDocumentListInput) {
    const where: Prisma.FiscalDocumentWhereInput = {
      organizationId: tenant.organizationId,
      ...(tenant.branchId
        ? { branchId: tenant.branchId }
        : input.branchId
          ? { branchId: input.branchId }
          : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.type ? { type: input.type } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.fiscalDocument.findMany({
        where,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          branchId: true,
          saleId: true,
          refundId: true,
          type: true,
          status: true,
          environment: true,
          traderInvoiceNumber: true,
          originalInvoiceNumber: true,
          currentReceiptNumber: true,
          totalReceiptNumber: true,
          internalData: true,
          receiptSignature: true,
          controlUnitDateTime: true,
          errorCode: true,
          errorMessage: true,
          submittedAt: true,
          acceptedAt: true,
          createdAt: true,
          branch: { select: { name: true, code: true } },
          outbox: {
            select: {
              status: true,
              attemptCount: true,
              nextAttemptAt: true,
              lastError: true,
            },
          },
        },
      }),
      prisma.fiscalDocument.count({ where }),
    ]);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }

  async retry(
    tenant: TenantContext,
    userId: string,
    documentId: string,
    input: RetryFiscalDocumentInput,
  ) {
    const document = await prisma.fiscalDocument.findFirst({
      where: { id: documentId, organizationId: tenant.organizationId },
      include: { outbox: true },
    });
    if (!document)
      throw new NotFoundException({
        code: "FISCAL_DOCUMENT_NOT_FOUND",
        message: "Fiscal document not found.",
      });
    if (document.status === "ACCEPTED")
      throw new ConflictException({
        code: "FISCAL_DOCUMENT_ALREADY_ACCEPTED",
        message: "An accepted fiscal document cannot be resubmitted.",
      });
    return prisma.$transaction(async (tx) => {
      await tx.fiscalDocument.update({
        where: { id: document.id },
        data: { status: "PENDING", errorCode: null, errorMessage: null },
      });
      const outbox = await tx.fiscalOutbox.upsert({
        where: { documentId: document.id },
        create: {
          organizationId: tenant.organizationId,
          documentId: document.id,
        },
        update: {
          status: "PENDING",
          nextAttemptAt: new Date(),
          lockedAt: null,
          lastError: null,
        },
      });
      await this.audit(
        tx,
        tenant.organizationId,
        userId,
        "ETIMS_DOCUMENT_REQUEUED",
        document.id,
        {
          reason: input.reason,
          priorStatus: document.status,
        },
      );
      return outbox;
    });
  }

  private safeIntegration<
    T extends {
      communicationKeyCiphertext: string | null;
      communicationKeyIv: string | null;
      communicationKeyTag: string | null;
    },
  >(row: T) {
    const {
      communicationKeyCiphertext,
      communicationKeyIv,
      communicationKeyTag,
      ...safe
    } = row;
    return {
      ...safe,
      communicationKeyConfigured: Boolean(
        communicationKeyCiphertext && communicationKeyIv && communicationKeyTag,
      ),
    };
  }

  private audit(
    tx: Transaction,
    organizationId: string,
    userId: string,
    action: string,
    entityId: string,
    afterJson: Prisma.InputJsonValue,
  ) {
    return tx.auditLog.create({
      data: {
        organizationId,
        userId,
        action,
        entityType: "Etims",
        entityId,
        afterJson,
      },
    });
  }
}
