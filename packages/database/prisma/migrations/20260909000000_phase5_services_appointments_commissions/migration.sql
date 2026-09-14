-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('BOOKED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE "CommissionRuleType" AS ENUM ('PERCENTAGE', 'FIXED');
CREATE TYPE "CommissionStatus" AS ENUM ('EARNED', 'REVERSED');

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN "staffProfileId" UUID;

-- CreateTable
CREATE TABLE "service_profiles" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "productId" UUID NOT NULL,
  "durationMinutes" INTEGER NOT NULL, "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
  "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0, "appointmentEnabled" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "service_profiles_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "staff_profiles" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "userId" UUID, "displayName" TEXT NOT NULL,
  "phone" TEXT, "email" TEXT, "jobTitle" TEXT, "isBookable" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "staff_services" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "staffProfileId" UUID NOT NULL,
  "serviceProductId" UUID NOT NULL, "customDurationMinutes" INTEGER, "customPriceMinor" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "staff_services_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "staff_branches" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "staffProfileId" UUID NOT NULL,
  "branchId" UUID NOT NULL, "isPrimary" BOOLEAN NOT NULL DEFAULT false, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_branches_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "staff_availability" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "staffProfileId" UUID NOT NULL,
  "branchId" UUID NOT NULL, "dayOfWeek" INTEGER NOT NULL, "startTime" TEXT NOT NULL, "endTime" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "staff_availability_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "staff_time_off" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "staffProfileId" UUID NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL, "endAt" TIMESTAMP(3) NOT NULL, "reason" TEXT, "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "staff_time_off_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "appointments" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "branchId" UUID NOT NULL, "customerId" UUID,
  "customerNameSnapshot" TEXT, "customerPhoneSnapshot" TEXT, "primaryStaffProfileId" UUID NOT NULL,
  "status" "AppointmentStatus" NOT NULL DEFAULT 'BOOKED', "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL, "blockedStartAt" TIMESTAMP(3) NOT NULL, "blockedEndAt" TIMESTAMP(3) NOT NULL,
  "notes" TEXT, "cancellationReason" TEXT, "saleId" UUID, "createdBy" UUID NOT NULL,
  "confirmedAt" TIMESTAMP(3), "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3), "noShowAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "appointment_services" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "appointmentId" UUID NOT NULL,
  "serviceProductId" UUID NOT NULL, "staffProfileId" UUID NOT NULL, "serviceNameSnapshot" TEXT NOT NULL,
  "durationMinutesSnapshot" INTEGER NOT NULL, "priceMinorSnapshot" INTEGER NOT NULL, "sequence" INTEGER NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL, "endAt" TIMESTAMP(3) NOT NULL, "blockedStartAt" TIMESTAMP(3) NOT NULL,
  "blockedEndAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "appointment_services_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "commission_rules" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "staffProfileId" UUID NOT NULL,
  "serviceProductId" UUID, "type" "CommissionRuleType" NOT NULL, "basisPoints" INTEGER, "valueMinor" INTEGER,
  "priority" INTEGER NOT NULL DEFAULT 0, "effectiveFrom" TIMESTAMP(3), "effectiveTo" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "commissions" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "branchId" UUID NOT NULL,
  "staffProfileId" UUID NOT NULL, "saleId" UUID NOT NULL, "saleItemId" UUID NOT NULL,
  "appointmentId" UUID, "ruleId" UUID, "baseAmountMinor" INTEGER NOT NULL,
  "commissionAmountMinor" INTEGER NOT NULL, "status" "CommissionStatus" NOT NULL DEFAULT 'EARNED',
  "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- Constraints and indexes
CREATE UNIQUE INDEX "service_profiles_productId_key" ON "service_profiles"("productId");
CREATE INDEX "service_profiles_organizationId_appointmentEnabled_isActive_idx" ON "service_profiles"("organizationId", "appointmentEnabled", "isActive");
CREATE UNIQUE INDEX "staff_profiles_organizationId_userId_key" ON "staff_profiles"("organizationId", "userId");
CREATE INDEX "staff_profiles_organizationId_isActive_displayName_idx" ON "staff_profiles"("organizationId", "isActive", "displayName");
CREATE UNIQUE INDEX "staff_services_staffProfileId_serviceProductId_key" ON "staff_services"("staffProfileId", "serviceProductId");
CREATE INDEX "staff_services_organizationId_serviceProductId_isActive_idx" ON "staff_services"("organizationId", "serviceProductId", "isActive");
CREATE UNIQUE INDEX "staff_branches_staffProfileId_branchId_key" ON "staff_branches"("staffProfileId", "branchId");
CREATE INDEX "staff_branches_organizationId_branchId_isActive_idx" ON "staff_branches"("organizationId", "branchId", "isActive");
CREATE INDEX "staff_availability_organizationId_staffProfileId_branchId_dayOfWeek_isActive_idx" ON "staff_availability"("organizationId", "staffProfileId", "branchId", "dayOfWeek", "isActive");
CREATE INDEX "staff_time_off_organizationId_staffProfileId_startAt_endAt_idx" ON "staff_time_off"("organizationId", "staffProfileId", "startAt", "endAt");
CREATE UNIQUE INDEX "appointments_saleId_key" ON "appointments"("saleId");
CREATE INDEX "appointments_organizationId_branchId_startAt_endAt_idx" ON "appointments"("organizationId", "branchId", "startAt", "endAt");
CREATE INDEX "appointments_organizationId_primaryStaffProfileId_status_startAt_idx" ON "appointments"("organizationId", "primaryStaffProfileId", "status", "startAt");
CREATE INDEX "appointments_organizationId_customerId_startAt_idx" ON "appointments"("organizationId", "customerId", "startAt");
CREATE UNIQUE INDEX "appointment_services_appointmentId_sequence_key" ON "appointment_services"("appointmentId", "sequence");
CREATE INDEX "appointment_services_appointmentId_staffProfileId_serviceProductId_idx" ON "appointment_services"("appointmentId", "staffProfileId", "serviceProductId");
CREATE INDEX "commission_rules_organizationId_staffProfileId_serviceProductId_isActive_idx" ON "commission_rules"("organizationId", "staffProfileId", "serviceProductId", "isActive");
CREATE UNIQUE INDEX "commissions_saleItemId_staffProfileId_key" ON "commissions"("saleItemId", "staffProfileId");
CREATE INDEX "commissions_organizationId_staffProfileId_earnedAt_idx" ON "commissions"("organizationId", "staffProfileId", "earnedAt");
CREATE INDEX "commissions_organizationId_branchId_earnedAt_idx" ON "commissions"("organizationId", "branchId", "earnedAt");
CREATE INDEX "commissions_organizationId_saleId_idx" ON "commissions"("organizationId", "saleId");
CREATE INDEX "sale_items_organizationId_staffProfileId_idx" ON "sale_items"("organizationId", "staffProfileId");

ALTER TABLE "service_profiles" ADD CONSTRAINT "service_profiles_duration_check" CHECK ("durationMinutes" > 0 AND "bufferBeforeMinutes" >= 0 AND "bufferAfterMinutes" >= 0);
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_overrides_check" CHECK (("customDurationMinutes" IS NULL OR "customDurationMinutes" > 0) AND ("customPriceMinor" IS NULL OR "customPriceMinor" >= 0));
ALTER TABLE "staff_availability" ADD CONSTRAINT "staff_availability_range_check" CHECK ("dayOfWeek" BETWEEN 0 AND 6 AND "startTime" < "endTime");
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_range_check" CHECK ("endAt" > "startAt");
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_range_check" CHECK ("endAt" > "startAt" AND "blockedEndAt" > "blockedStartAt");
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_values_check" CHECK ("durationMinutesSnapshot" > 0 AND "priceMinorSnapshot" >= 0 AND "endAt" > "startAt" AND "blockedEndAt" > "blockedStartAt");
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_value_check" CHECK (("type" = 'PERCENTAGE' AND "basisPoints" BETWEEN 0 AND 10000 AND "valueMinor" IS NULL) OR ("type" = 'FIXED' AND "valueMinor" >= 0 AND "basisPoints" IS NULL));
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_period_check" CHECK ("effectiveFrom" IS NULL OR "effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_amount_check" CHECK ("baseAmountMinor" >= 0 AND "commissionAmountMinor" >= 0 AND "commissionAmountMinor" <= "baseAmountMinor");

ALTER TABLE "service_profiles" ADD CONSTRAINT "service_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_profiles" ADD CONSTRAINT "service_profiles_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_serviceProductId_fkey" FOREIGN KEY ("serviceProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_branches" ADD CONSTRAINT "staff_branches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_branches" ADD CONSTRAINT "staff_branches_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_branches" ADD CONSTRAINT "staff_branches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_availability" ADD CONSTRAINT "staff_availability_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_availability" ADD CONSTRAINT "staff_availability_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_availability" ADD CONSTRAINT "staff_availability_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_primaryStaffProfileId_fkey" FOREIGN KEY ("primaryStaffProfileId") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_serviceProductId_fkey" FOREIGN KEY ("serviceProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_serviceProductId_fkey" FOREIGN KEY ("serviceProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "commission_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
