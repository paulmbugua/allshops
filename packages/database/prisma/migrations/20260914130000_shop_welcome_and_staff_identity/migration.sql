ALTER TABLE "organizations"
  ADD COLUMN "welcomeHeadline" TEXT,
  ADD COLUMN "tagline" TEXT,
  ADD COLUMN "motto" TEXT,
  ADD COLUMN "welcomeMessage" TEXT,
  ADD COLUMN "brandPrimaryColor" TEXT NOT NULL DEFAULT '#172C2B',
  ADD COLUMN "brandAccentColor" TEXT NOT NULL DEFAULT '#FFCF5C',
  ADD COLUMN "idleTimeoutMinutes" INTEGER NOT NULL DEFAULT 5;

ALTER TABLE "staff_profiles"
  ADD COLUMN "employeeNumber" TEXT;

CREATE UNIQUE INDEX "staff_profiles_organizationId_employeeNumber_key"
  ON "staff_profiles"("organizationId", "employeeNumber");
