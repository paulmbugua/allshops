CREATE TYPE "RefundStatus" AS ENUM ('COMPLETED', 'VOIDED');
CREATE TYPE "RefundKind" AS ENUM ('REFUND', 'RETURN', 'EXCHANGE');
CREATE TYPE "RegisterShiftStatus" AS ENUM ('OPEN', 'CLOSED', 'APPROVED');
CREATE TYPE "CashMovementType" AS ENUM ('CASH_IN', 'CASH_OUT');
CREATE TYPE "OperationalAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

CREATE TABLE "sale_refunds" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "saleId" UUID NOT NULL,
  "kind" "RefundKind" NOT NULL DEFAULT 'REFUND',
  "status" "RefundStatus" NOT NULL DEFAULT 'COMPLETED',
  "amountMinor" INTEGER NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "reason" TEXT NOT NULL,
  "reference" TEXT,
  "replacementSaleId" UUID,
  "idempotencyKey" UUID NOT NULL,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sale_refunds_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "sale_refund_items" (
  "id" UUID NOT NULL,
  "refundId" UUID NOT NULL,
  "saleItemId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "variantId" UUID,
  "quantity" DECIMAL(18,4) NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  CONSTRAINT "sale_refund_items_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "register_shifts" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "cashierId" UUID NOT NULL,
  "deviceId" UUID,
  "status" "RegisterShiftStatus" NOT NULL DEFAULT 'OPEN',
  "openingCashMinor" INTEGER NOT NULL,
  "expectedCashMinor" INTEGER,
  "countedCashMinor" INTEGER,
  "varianceMinor" INTEGER,
  "notes" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "openedBy" UUID NOT NULL,
  "closedBy" UUID,
  "approvedBy" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "register_shifts_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "cash_movements" (
  "id" UUID NOT NULL,
  "shiftId" UUID NOT NULL,
  "type" "CashMovementType" NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "operational_alerts" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "branchId" UUID,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'INFO',
  "status" "OperationalAlertStatus" NOT NULL DEFAULT 'OPEN',
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "dedupeKey" TEXT,
  "acknowledgedBy" UUID,
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "operational_alerts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sale_refunds_organizationId_idempotencyKey_key" ON "sale_refunds"("organizationId", "idempotencyKey");
CREATE UNIQUE INDEX "sale_refund_items_refundId_saleItemId_key" ON "sale_refund_items"("refundId", "saleItemId");
CREATE UNIQUE INDEX "operational_alerts_organizationId_dedupeKey_key" ON "operational_alerts"("organizationId", "dedupeKey");
CREATE INDEX "sale_refunds_organizationId_branchId_createdAt_idx" ON "sale_refunds"("organizationId", "branchId", "createdAt");
CREATE INDEX "sale_refunds_saleId_status_idx" ON "sale_refunds"("saleId", "status");
CREATE INDEX "register_shifts_organizationId_branchId_status_idx" ON "register_shifts"("organizationId", "branchId", "status");
CREATE INDEX "register_shifts_cashierId_openedAt_idx" ON "register_shifts"("cashierId", "openedAt");
CREATE INDEX "cash_movements_shiftId_createdAt_idx" ON "cash_movements"("shiftId", "createdAt");
CREATE INDEX "operational_alerts_organizationId_status_createdAt_idx" ON "operational_alerts"("organizationId", "status", "createdAt");
ALTER TABLE "sale_refunds" ADD CONSTRAINT "sale_refunds_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_refunds" ADD CONSTRAINT "sale_refunds_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_refunds" ADD CONSTRAINT "sale_refunds_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_refunds" ADD CONSTRAINT "sale_refunds_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_refund_items" ADD CONSTRAINT "sale_refund_items_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "sale_refunds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_refund_items" ADD CONSTRAINT "sale_refund_items_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_refund_items" ADD CONSTRAINT "sale_refund_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_refund_items" ADD CONSTRAINT "sale_refund_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "register_shifts" ADD CONSTRAINT "register_shifts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "register_shifts" ADD CONSTRAINT "register_shifts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "register_shifts" ADD CONSTRAINT "register_shifts_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "register_shifts" ADD CONSTRAINT "register_shifts_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "register_shifts" ADD CONSTRAINT "register_shifts_openedBy_fkey" FOREIGN KEY ("openedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "register_shifts" ADD CONSTRAINT "register_shifts_closedBy_fkey" FOREIGN KEY ("closedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "register_shifts" ADD CONSTRAINT "register_shifts_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "register_shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_alerts" ADD CONSTRAINT "operational_alerts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "operational_alerts" ADD CONSTRAINT "operational_alerts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "operational_alerts" ADD CONSTRAINT "operational_alerts_acknowledgedBy_fkey" FOREIGN KEY ("acknowledgedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
