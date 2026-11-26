CREATE TABLE "sale_loyalty_awards" (
  "saleId" UUID NOT NULL PRIMARY KEY REFERENCES "sales"("id") ON DELETE CASCADE,
  "organizationId" UUID NOT NULL,
  "memberPhone" TEXT NOT NULL,
  "memberName" TEXT NOT NULL,
  "points" INTEGER NOT NULL CHECK ("points" > 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "sale_loyalty_awards_organizationId_memberPhone_idx"
  ON "sale_loyalty_awards" ("organizationId", "memberPhone");
