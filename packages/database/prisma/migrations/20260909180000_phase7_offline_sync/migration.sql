CREATE TYPE "SaleSource" AS ENUM ('ONLINE', 'OFFLINE_SYNC');
CREATE TYPE "OfflineSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'CONFLICT', 'REJECTED');

ALTER TABLE "devices"
ADD COLUMN "userId" UUID,
ADD COLUMN "lastSyncAt" TIMESTAMP(3),
ADD COLUMN "revokedAt" TIMESTAMP(3);

ALTER TABLE "sales"
ADD COLUMN "source" "SaleSource" NOT NULL DEFAULT 'ONLINE',
ADD COLUMN "transactionUuid" UUID,
ADD COLUMN "localReference" TEXT,
ADD COLUMN "clientCreatedAt" TIMESTAMP(3),
ADD COLUMN "syncedAt" TIMESTAMP(3);

CREATE TABLE "offline_transactions" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "deviceId" UUID NOT NULL,
  "submittedBy" UUID NOT NULL,
  "transactionUuid" UUID NOT NULL,
  "transactionType" TEXT NOT NULL DEFAULT 'SALE',
  "payloadVersion" INTEGER NOT NULL DEFAULT 1,
  "payloadHash" TEXT NOT NULL,
  "payloadJson" JSONB NOT NULL,
  "status" "OfflineSyncStatus" NOT NULL DEFAULT 'PENDING',
  "saleId" UUID,
  "invoiceNumber" TEXT,
  "localReference" TEXT NOT NULL,
  "clientCreatedAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "conflictCode" TEXT,
  "conflictMessage" TEXT,
  "resolution" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "offline_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sales_organizationId_transactionUuid_key" ON "sales"("organizationId", "transactionUuid");
CREATE UNIQUE INDEX "sales_organizationId_deviceId_localReference_key" ON "sales"("organizationId", "deviceId", "localReference");
CREATE INDEX "devices_organizationId_userId_status_idx" ON "devices"("organizationId", "userId", "status");
CREATE UNIQUE INDEX "offline_transactions_saleId_key" ON "offline_transactions"("saleId");
CREATE UNIQUE INDEX "offline_transactions_organizationId_transactionUuid_key" ON "offline_transactions"("organizationId", "transactionUuid");
CREATE UNIQUE INDEX "offline_transactions_organizationId_deviceId_localReference_key" ON "offline_transactions"("organizationId", "deviceId", "localReference");
CREATE INDEX "offline_transactions_organizationId_status_createdAt_idx" ON "offline_transactions"("organizationId", "status", "createdAt");
CREATE INDEX "offline_transactions_organizationId_deviceId_status_createdAt_idx" ON "offline_transactions"("organizationId", "deviceId", "status", "createdAt");

ALTER TABLE "devices" ADD CONSTRAINT "devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "offline_transactions" ADD CONSTRAINT "offline_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offline_transactions" ADD CONSTRAINT "offline_transactions_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offline_transactions" ADD CONSTRAINT "offline_transactions_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
