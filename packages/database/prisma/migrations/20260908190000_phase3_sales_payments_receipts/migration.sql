ALTER TYPE "StockMovementType" ADD VALUE 'SALE';

CREATE TYPE "SaleStatus" AS ENUM ('DRAFT', 'HELD', 'COMPLETED', 'CANCELLED');
CREATE TYPE "SalePaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'QR', 'OTHER');
CREATE TYPE "PaymentRecordStatus" AS ENUM ('RECORDED', 'VOIDED');
CREATE TYPE "DiscountType" AS ENUM ('FIXED', 'PERCENTAGE');

CREATE TABLE "sales" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "invoiceNumber" TEXT,
  "status" "SaleStatus" NOT NULL DEFAULT 'DRAFT',
  "paymentStatus" "SalePaymentStatus" NOT NULL DEFAULT 'UNPAID',
  "subtotalMinor" INTEGER NOT NULL DEFAULT 0,
  "discountMinor" INTEGER NOT NULL DEFAULT 0,
  "taxMinor" INTEGER NOT NULL DEFAULT 0,
  "totalMinor" INTEGER NOT NULL DEFAULT 0,
  "paidMinor" INTEGER NOT NULL DEFAULT 0,
  "changeMinor" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'QAR',
  "discountType" "DiscountType",
  "discountValue" INTEGER,
  "customerName" TEXT,
  "customerPhone" TEXT,
  "notes" TEXT,
  "deviceId" TEXT,
  "createdBy" UUID NOT NULL,
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_items" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "saleId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "variantId" UUID,
  "productNameSnapshot" TEXT NOT NULL,
  "variantNameSnapshot" TEXT,
  "skuSnapshot" TEXT,
  "barcodeSnapshot" TEXT,
  "quantity" DECIMAL(18,4) NOT NULL,
  "unitPriceMinor" INTEGER NOT NULL,
  "unitCostMinor" INTEGER NOT NULL,
  "grossMinor" INTEGER NOT NULL,
  "discountMinor" INTEGER NOT NULL DEFAULT 0,
  "taxMinor" INTEGER NOT NULL DEFAULT 0,
  "totalMinor" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payments" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "saleId" UUID NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "status" "PaymentRecordStatus" NOT NULL DEFAULT 'RECORDED',
  "amountMinor" INTEGER NOT NULL,
  "tenderedMinor" INTEGER,
  "reference" TEXT,
  "recordedBy" UUID NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_sequences" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "year" INTEGER NOT NULL,
  "documentType" TEXT NOT NULL,
  "currentValue" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invoice_sequences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sales_organizationId_invoiceNumber_key" ON "sales"("organizationId", "invoiceNumber");
CREATE INDEX "sales_organizationId_branchId_createdAt_idx" ON "sales"("organizationId", "branchId", "createdAt");
CREATE INDEX "sales_organizationId_status_createdAt_idx" ON "sales"("organizationId", "status", "createdAt");
CREATE INDEX "sale_items_organizationId_productId_variantId_idx" ON "sale_items"("organizationId", "productId", "variantId");
CREATE INDEX "sale_items_saleId_idx" ON "sale_items"("saleId");
CREATE INDEX "payments_organizationId_recordedAt_idx" ON "payments"("organizationId", "recordedAt");
CREATE INDEX "payments_saleId_status_idx" ON "payments"("saleId", "status");
CREATE UNIQUE INDEX "invoice_sequences_organizationId_year_documentType_key" ON "invoice_sequences"("organizationId", "year", "documentType");

ALTER TABLE "sales" ADD CONSTRAINT "sales_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_sequences" ADD CONSTRAINT "invoice_sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
