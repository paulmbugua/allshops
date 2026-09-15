CREATE TYPE "AccountTokenType" AS ENUM ('EMAIL_ACTIVATION', 'PASSWORD_RESET');
CREATE TYPE "ReconciliationStatus" AS ENUM ('SUBMITTED', 'APPROVED');

CREATE TABLE "account_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "AccountTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "account_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_tokens_tokenHash_key" ON "account_tokens"("tokenHash");
CREATE INDEX "account_tokens_userId_type_usedAt_idx" ON "account_tokens"("userId", "type", "usedAt");
CREATE INDEX "account_tokens_expiresAt_idx" ON "account_tokens"("expiresAt");
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "cashier_reconciliations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "cashierId" UUID NOT NULL,
    "businessDate" DATE NOT NULL,
    "transactionCount" INTEGER NOT NULL,
    "totalSalesMinor" INTEGER NOT NULL,
    "expectedCashMinor" INTEGER NOT NULL,
    "cardSalesMinor" INTEGER NOT NULL,
    "creditSalesMinor" INTEGER NOT NULL,
    "countedCashMinor" INTEGER NOT NULL,
    "varianceMinor" INTEGER NOT NULL,
    "notes" TEXT,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedBy" UUID NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cashier_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cashier_reconciliations_organizationId_branchId_cashierId_businessDate_key" ON "cashier_reconciliations"("organizationId", "branchId", "cashierId", "businessDate");
CREATE INDEX "cashier_reconciliations_organizationId_businessDate_status_idx" ON "cashier_reconciliations"("organizationId", "businessDate", "status");
CREATE INDEX "cashier_reconciliations_branchId_businessDate_idx" ON "cashier_reconciliations"("branchId", "businessDate");
ALTER TABLE "cashier_reconciliations" ADD CONSTRAINT "cashier_reconciliations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cashier_reconciliations" ADD CONSTRAINT "cashier_reconciliations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cashier_reconciliations" ADD CONSTRAINT "cashier_reconciliations_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cashier_reconciliations" ADD CONSTRAINT "cashier_reconciliations_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cashier_reconciliations" ADD CONSTRAINT "cashier_reconciliations_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
