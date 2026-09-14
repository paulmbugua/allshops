-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD', 'SUSPENDED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'ANNUAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BillingRecordStatus" AS ENUM ('DUE', 'PAID', 'VOID', 'FAILED', 'WAIVED');

-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "entitlementExpiresAt" TIMESTAMP(3),
ADD COLUMN     "entitlementSnapshotAt" TIMESTAMP(3),
ADD COLUMN     "entitlementStatus" "SubscriptionStatus",
ADD COLUMN     "offlineEntitled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthlyPriceMinor" INTEGER NOT NULL,
    "annualPriceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'QAR',
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_features" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "featureCode" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "plan_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_limits" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "limitCode" TEXT NOT NULL,
    "value" INTEGER,

    CONSTRAINT "plan_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "pendingPlanId" UUID,
    "status" "SubscriptionStatus" NOT NULL,
    "billingInterval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "currency" TEXT NOT NULL DEFAULT 'QAR',
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "trialStartedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "changeEffectiveAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromPlanId" UUID,
    "toPlanId" UUID,
    "fromStatus" "SubscriptionStatus",
    "toStatus" "SubscriptionStatus",
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_sequences" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "billing_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_records" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "billingNumber" TEXT NOT NULL,
    "planCodeSnapshot" TEXT NOT NULL,
    "planNameSnapshot" TEXT NOT NULL,
    "billingInterval" "BillingInterval" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "BillingRecordStatus" NOT NULL DEFAULT 'DUE',
    "paymentMethod" TEXT,
    "paymentReference" TEXT,
    "confirmationKey" TEXT,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "confirmedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE INDEX "plans_isActive_isPublic_sortOrder_idx" ON "plans"("isActive", "isPublic", "sortOrder");

-- CreateIndex
CREATE INDEX "plan_features_featureCode_enabled_idx" ON "plan_features"("featureCode", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "plan_features_planId_featureCode_key" ON "plan_features"("planId", "featureCode");

-- CreateIndex
CREATE INDEX "plan_limits_limitCode_idx" ON "plan_limits"("limitCode");

-- CreateIndex
CREATE UNIQUE INDEX "plan_limits_planId_limitCode_key" ON "plan_limits"("planId", "limitCode");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_organizationId_key" ON "subscriptions"("organizationId");

-- CreateIndex
CREATE INDEX "subscriptions_status_currentPeriodEnd_idx" ON "subscriptions"("status", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "subscriptions_planId_status_idx" ON "subscriptions"("planId", "status");

-- CreateIndex
CREATE INDEX "subscriptions_trialEndsAt_idx" ON "subscriptions"("trialEndsAt");

-- CreateIndex
CREATE INDEX "subscriptions_graceEndsAt_idx" ON "subscriptions"("graceEndsAt");

-- CreateIndex
CREATE INDEX "subscription_events_organizationId_occurredAt_idx" ON "subscription_events"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "subscription_events_subscriptionId_eventType_occurredAt_idx" ON "subscription_events"("subscriptionId", "eventType", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "billing_sequences_organizationId_year_key" ON "billing_sequences"("organizationId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "billing_records_billingNumber_key" ON "billing_records"("billingNumber");

-- CreateIndex
CREATE UNIQUE INDEX "billing_records_confirmationKey_key" ON "billing_records"("confirmationKey");

-- CreateIndex
CREATE INDEX "billing_records_organizationId_status_createdAt_idx" ON "billing_records"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "billing_records_subscriptionId_status_dueAt_idx" ON "billing_records"("subscriptionId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "billing_records_paidAt_idx" ON "billing_records"("paidAt");

-- AddForeignKey
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_limits" ADD CONSTRAINT "plan_limits_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_pendingPlanId_fkey" FOREIGN KEY ("pendingPlanId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_fromPlanId_fkey" FOREIGN KEY ("fromPlanId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_toPlanId_fkey" FOREIGN KEY ("toPlanId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_sequences" ADD CONSTRAINT "billing_sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_confirmedBy_fkey" FOREIGN KEY ("confirmedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX IF EXISTS "appointment_services_appointmentId_staffProfileId_serviceProduc" RENAME TO "appointment_services_appointmentId_staffProfileId_servicePr_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "appointments_organizationId_primaryStaffProfileId_status_startA" RENAME TO "appointments_organizationId_primaryStaffProfileId_status_st_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "commission_rules_organizationId_staffProfileId_serviceProductId" RENAME TO "commission_rules_organizationId_staffProfileId_serviceProdu_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "offline_transactions_organizationId_deviceId_status_createdAt_i" RENAME TO "offline_transactions_organizationId_deviceId_status_created_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "staff_availability_organizationId_staffProfileId_branchId_dayOf" RENAME TO "staff_availability_organizationId_staffProfileId_branchId_d_idx";
