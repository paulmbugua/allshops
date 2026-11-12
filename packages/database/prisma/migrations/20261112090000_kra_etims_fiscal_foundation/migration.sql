CREATE TYPE "EtimsEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');
CREATE TYPE "EtimsIntegrationStatus" AS ENUM ('DISABLED', 'DRAFT', 'SANDBOX', 'CERTIFIED', 'SUSPENDED');
CREATE TYPE "FiscalDocumentType" AS ENUM ('SALE', 'CREDIT_NOTE');
CREATE TYPE "FiscalDocumentStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'SUBMITTING', 'ACCEPTED', 'REJECTED', 'RETRY');
CREATE TYPE "FiscalOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'RETRY', 'DEAD_LETTER');

ALTER TABLE "sales" ADD COLUMN "fiscalStatus" "FiscalDocumentStatus" NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE "sale_refunds" ADD COLUMN "fiscalStatus" "FiscalDocumentStatus" NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE "sale_items"
  ADD COLUMN "etimsItemCode" TEXT,
  ADD COLUMN "etimsItemClassCode" TEXT,
  ADD COLUMN "etimsTaxTypeCode" TEXT,
  ADD COLUMN "etimsTaxRateBps" INTEGER,
  ADD COLUMN "etimsPackageUnitCode" TEXT,
  ADD COLUMN "etimsQuantityUnitCode" TEXT;

CREATE TABLE "etims_integrations" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "environment" "EtimsEnvironment" NOT NULL DEFAULT 'SANDBOX',
  "status" "EtimsIntegrationStatus" NOT NULL DEFAULT 'DRAFT',
  "kraPin" TEXT NOT NULL,
  "traderSystemName" TEXT NOT NULL DEFAULT 'AllShops POS + ERP',
  "communicationKeyCiphertext" TEXT,
  "communicationKeyIv" TEXT,
  "communicationKeyTag" TEXT,
  "lastSuccessfulSubmissionAt" TIMESTAMP(3),
  "lastFailureAt" TIMESTAMP(3),
  "lastFailureCode" TEXT,
  "lastFailureMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "etims_integrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "etims_branch_configs" (
  "id" UUID NOT NULL,
  "integrationId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "kraBranchId" TEXT NOT NULL,
  "deviceSerial" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "initializedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "etims_branch_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "etims_product_mappings" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "itemCode" TEXT NOT NULL,
  "itemClassCode" TEXT NOT NULL,
  "itemTypeCode" TEXT NOT NULL DEFAULT '2',
  "taxTypeCode" TEXT NOT NULL,
  "taxRateBps" INTEGER NOT NULL,
  "originNationCode" TEXT NOT NULL DEFAULT 'KE',
  "packageUnitCode" TEXT NOT NULL DEFAULT 'NT',
  "quantityUnitCode" TEXT NOT NULL DEFAULT 'U',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "etims_product_mappings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "etims_product_mappings_tax_rate_check" CHECK ("taxRateBps" >= 0 AND "taxRateBps" <= 10000)
);

CREATE TABLE "fiscal_documents" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "saleId" UUID,
  "refundId" UUID,
  "type" "FiscalDocumentType" NOT NULL,
  "status" "FiscalDocumentStatus" NOT NULL DEFAULT 'PENDING',
  "environment" "EtimsEnvironment" NOT NULL,
  "traderInvoiceNumber" TEXT NOT NULL,
  "originalInvoiceNumber" TEXT,
  "requestJson" JSONB NOT NULL,
  "responseJson" JSONB,
  "currentReceiptNumber" TEXT,
  "totalReceiptNumber" TEXT,
  "internalData" TEXT,
  "receiptSignature" TEXT,
  "controlUnitDateTime" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "submittedAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fiscal_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal_documents_subject_check" CHECK (("type" = 'SALE' AND "saleId" IS NOT NULL AND "refundId" IS NULL) OR ("type" = 'CREDIT_NOTE' AND "refundId" IS NOT NULL AND "saleId" IS NULL))
);

CREATE TABLE "fiscal_outbox" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "documentId" UUID NOT NULL,
  "status" "FiscalOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fiscal_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "etims_integrations_organizationId_key" ON "etims_integrations"("organizationId");
CREATE INDEX "etims_integrations_status_environment_idx" ON "etims_integrations"("status", "environment");
CREATE UNIQUE INDEX "etims_branch_configs_branchId_key" ON "etims_branch_configs"("branchId");
CREATE UNIQUE INDEX "etims_branch_configs_integrationId_kraBranchId_key" ON "etims_branch_configs"("integrationId", "kraBranchId");
CREATE INDEX "etims_branch_configs_integrationId_isActive_idx" ON "etims_branch_configs"("integrationId", "isActive");
CREATE UNIQUE INDEX "etims_product_mappings_productId_key" ON "etims_product_mappings"("productId");
CREATE UNIQUE INDEX "etims_product_mappings_organizationId_itemCode_key" ON "etims_product_mappings"("organizationId", "itemCode");
CREATE INDEX "etims_product_mappings_organizationId_isActive_idx" ON "etims_product_mappings"("organizationId", "isActive");
CREATE UNIQUE INDEX "fiscal_documents_saleId_key" ON "fiscal_documents"("saleId");
CREATE UNIQUE INDEX "fiscal_documents_refundId_key" ON "fiscal_documents"("refundId");
CREATE UNIQUE INDEX "fiscal_documents_organizationId_traderInvoiceNumber_type_key" ON "fiscal_documents"("organizationId", "traderInvoiceNumber", "type");
CREATE INDEX "fiscal_documents_organizationId_status_createdAt_idx" ON "fiscal_documents"("organizationId", "status", "createdAt");
CREATE INDEX "fiscal_documents_branchId_status_createdAt_idx" ON "fiscal_documents"("branchId", "status", "createdAt");
CREATE UNIQUE INDEX "fiscal_outbox_documentId_key" ON "fiscal_outbox"("documentId");
CREATE INDEX "fiscal_outbox_status_nextAttemptAt_idx" ON "fiscal_outbox"("status", "nextAttemptAt");
CREATE INDEX "fiscal_outbox_organizationId_status_createdAt_idx" ON "fiscal_outbox"("organizationId", "status", "createdAt");

ALTER TABLE "etims_integrations" ADD CONSTRAINT "etims_integrations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "etims_branch_configs" ADD CONSTRAINT "etims_branch_configs_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "etims_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "etims_branch_configs" ADD CONSTRAINT "etims_branch_configs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "etims_product_mappings" ADD CONSTRAINT "etims_product_mappings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "etims_product_mappings" ADD CONSTRAINT "etims_product_mappings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "sale_refunds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_outbox" ADD CONSTRAINT "fiscal_outbox_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiscal_outbox" ADD CONSTRAINT "fiscal_outbox_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "fiscal_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "code", "description", "createdAt") VALUES
  (gen_random_uuid(), 'etims.read', 'View KRA eTIMS configuration and fiscal documents', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'etims.manage', 'Configure KRA eTIMS branches and product mappings', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'etims.retry', 'Retry rejected or interrupted KRA eTIMS submissions', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."code" IN ('etims.read', 'etims.manage', 'etims.retry')
WHERE r."organizationId" IS NULL AND r."code" IN ('OWNER', 'ADMIN', 'MANAGER')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."code" IN ('etims.read', 'etims.retry')
WHERE r."organizationId" IS NULL AND r."code" = 'BRANCH_MANAGER'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."code" = 'etims.read'
WHERE r."organizationId" IS NULL AND r."code" IN ('ACCOUNTANT', 'AUDITOR')
ON CONFLICT DO NOTHING;
