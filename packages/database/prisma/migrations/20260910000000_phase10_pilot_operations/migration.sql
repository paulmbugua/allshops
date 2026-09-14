CREATE TYPE "PilotStatus" AS ENUM ('PENDING_SETUP', 'ONBOARDING', 'READY_FOR_UAT', 'PILOT_ACTIVE', 'PAUSED', 'GRADUATED', 'EXITED');
CREATE TYPE "OnboardingStepStatus" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED');
CREATE TYPE "SupportIssueCategory" AS ENUM ('POS', 'PAYMENT', 'RECEIPT', 'INVENTORY', 'CUSTOMER', 'PURCHASE', 'REPORT', 'OFFLINE_SYNC', 'SUBSCRIPTION', 'LOGIN_ACCESS', 'APPOINTMENT', 'OTHER');
CREATE TYPE "SupportIssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "SupportIssueStatus" AS ENUM ('OPEN', 'TRIAGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
CREATE TYPE "FeedbackCategory" AS ENUM ('BUG', 'USABILITY', 'MISSING_CORE', 'ENHANCEMENT', 'OUT_OF_SCOPE');

CREATE TABLE "pilot_organizations" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "status" "PilotStatus" NOT NULL DEFAULT 'PENDING_SETUP',
  "pilotStartedAt" TIMESTAMP(3), "pilotEndedAt" TIMESTAMP(3),
  "assignedSupportOwner" UUID, "businessCategory" TEXT, "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pilot_organizations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pilot_organizations_organizationId_key" UNIQUE ("organizationId"),
  CONSTRAINT "pilot_organizations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pilot_organizations_assignedSupportOwner_fkey" FOREIGN KEY ("assignedSupportOwner") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "pilot_organizations_status_updatedAt_idx" ON "pilot_organizations"("status", "updatedAt");

CREATE TABLE "organization_feature_flags" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "featureCode" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false, "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_feature_flags_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_feature_flags_organizationId_featureCode_key" UNIQUE ("organizationId", "featureCode"),
  CONSTRAINT "organization_feature_flags_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "organization_feature_flags_featureCode_enabled_idx" ON "organization_feature_flags"("featureCode", "enabled");

CREATE TABLE "organization_onboarding_steps" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "stepCode" TEXT NOT NULL,
  "status" "OnboardingStepStatus" NOT NULL DEFAULT 'PENDING', "completedAt" TIMESTAMP(3), "completedBy" UUID, "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_onboarding_steps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_onboarding_steps_organizationId_stepCode_key" UNIQUE ("organizationId", "stepCode"),
  CONSTRAINT "organization_onboarding_steps_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "organization_onboarding_steps_completedBy_fkey" FOREIGN KEY ("completedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "organization_onboarding_steps_organizationId_status_idx" ON "organization_onboarding_steps"("organizationId", "status");

CREATE TABLE "support_issues" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "reportedBy" UUID NOT NULL,
  "category" "SupportIssueCategory" NOT NULL, "severity" "SupportIssueSeverity" NOT NULL DEFAULT 'MEDIUM',
  "title" TEXT NOT NULL, "description" TEXT NOT NULL, "status" "SupportIssueStatus" NOT NULL DEFAULT 'OPEN',
  "requestId" TEXT, "invoiceNumber" TEXT, "localReference" TEXT, "appVersion" TEXT, "branchId" UUID, "deviceId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "support_issues_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "support_issues_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "support_issues_reportedBy_fkey" FOREIGN KEY ("reportedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "support_issues_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "support_issues_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "support_issues_organizationId_status_createdAt_idx" ON "support_issues"("organizationId", "status", "createdAt");
CREATE INDEX "support_issues_organizationId_severity_createdAt_idx" ON "support_issues"("organizationId", "severity", "createdAt");

CREATE TABLE "pilot_feedback" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "submittedBy" UUID NOT NULL,
  "category" "FeedbackCategory" NOT NULL, "title" TEXT NOT NULL, "description" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pilot_feedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pilot_feedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pilot_feedback_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "pilot_feedback_organizationId_createdAt_idx" ON "pilot_feedback"("organizationId", "createdAt");
