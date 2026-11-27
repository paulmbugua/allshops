ALTER TYPE "BusinessType" ADD VALUE 'WATER_VENDING';
ALTER TYPE "BusinessType" ADD VALUE 'ANIMAL_FEEDS';
ALTER TYPE "BusinessType" ADD VALUE 'BAKERY';
ALTER TYPE "BusinessType" ADD VALUE 'FACTORY';
ALTER TYPE "BusinessType" ADD VALUE 'PHARMACY';
ALTER TYPE "BusinessType" ADD VALUE 'BUTCHERY';
ALTER TYPE "BusinessType" ADD VALUE 'AGROVET';
ALTER TYPE "BusinessType" ADD VALUE 'WHOLESALE';
ALTER TYPE "BusinessType" ADD VALUE 'LPG_RETAIL';

CREATE TYPE "PosOrderStage" AS ENUM ('PLACED', 'IN_PROGRESS', 'READY', 'FULFILLED');

ALTER TABLE "sales"
  ADD COLUMN "orderStage" "PosOrderStage",
  ADD COLUMN "orderCategory" "BusinessType",
  ADD COLUMN "orderChannel" TEXT,
  ADD COLUMN "orderReference" TEXT,
  ADD COLUMN "orderUpdatedAt" TIMESTAMP(3);

CREATE INDEX "sales_order_queue_idx" ON "sales"("organizationId", "branchId", "status", "orderStage", "createdAt");

CREATE UNIQUE INDEX "payments_unique_manual_mpesa_reference"
  ON "payments"("organizationId", "reference")
  WHERE "method" = 'OTHER' AND "reference" LIKE 'M-PESA MANUAL:%';
