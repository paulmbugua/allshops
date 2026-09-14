CREATE TYPE "PaystackPaymentStatus" AS ENUM (
  'INITIALIZING',
  'REQUIRES_ACTION',
  'PAID',
  'COMPLETED',
  'FAILED',
  'PAID_REQUIRES_REVIEW'
);

CREATE TABLE "paystack_payment_intents" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "createdBy" UUID NOT NULL,
  "saleId" UUID,
  "reference" TEXT NOT NULL,
  "idempotencyKey" UUID NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status" "PaystackPaymentStatus" NOT NULL DEFAULT 'INITIALIZING',
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'QAR',
  "checkoutJson" JSONB NOT NULL,
  "priceSnapshotJson" JSONB NOT NULL,
  "authorizationUrl" TEXT,
  "accessCode" TEXT,
  "providerPayload" JSONB,
  "failureMessage" TEXT,
  "paidAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "paystack_payment_intents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "paystack_payment_intents_amount_positive" CHECK ("amountMinor" > 0)
);

CREATE UNIQUE INDEX "paystack_payment_intents_saleId_key" ON "paystack_payment_intents"("saleId");
CREATE UNIQUE INDEX "paystack_payment_intents_reference_key" ON "paystack_payment_intents"("reference");
CREATE UNIQUE INDEX "paystack_payment_intents_organizationId_idempotencyKey_key" ON "paystack_payment_intents"("organizationId", "idempotencyKey");
CREATE INDEX "paystack_payment_intents_organizationId_status_createdAt_idx" ON "paystack_payment_intents"("organizationId", "status", "createdAt");
CREATE INDEX "paystack_payment_intents_createdBy_reference_idx" ON "paystack_payment_intents"("createdBy", "reference");

ALTER TABLE "paystack_payment_intents" ADD CONSTRAINT "paystack_payment_intents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "paystack_payment_intents" ADD CONSTRAINT "paystack_payment_intents_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "paystack_payment_intents" ADD CONSTRAINT "paystack_payment_intents_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "paystack_payment_intents" ADD CONSTRAINT "paystack_payment_intents_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
