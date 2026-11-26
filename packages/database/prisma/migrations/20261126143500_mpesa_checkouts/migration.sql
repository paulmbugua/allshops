CREATE TABLE "mpesa_checkouts" (
  "id" UUID NOT NULL PRIMARY KEY,
  "organizationId" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "branchId" UUID NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT,
  "createdBy" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "status" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL CHECK ("amountMinor" > 0),
  "checkout" JSONB NOT NULL,
  "providerRequestId" TEXT UNIQUE,
  "saleId" UUID UNIQUE REFERENCES "sales"("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "mpesa_checkouts_organizationId_createdBy_status_idx"
  ON "mpesa_checkouts" ("organizationId", "createdBy", "status");

CREATE UNIQUE INDEX "mpesa_checkouts_one_active_per_cashier"
  ON "mpesa_checkouts" ("organizationId", "createdBy")
  WHERE "status" IN ('SENDING', 'PENDING', 'REVIEW');
