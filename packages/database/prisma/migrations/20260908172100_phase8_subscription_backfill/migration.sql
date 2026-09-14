-- Seed the stable plan catalogue needed for a safe legacy backfill.
INSERT INTO "plans" ("id", "code", "name", "description", "monthlyPriceMinor", "annualPriceMinor", "currency", "isPublic", "isActive", "sortOrder", "updatedAt")
VALUES
  (gen_random_uuid(), 'STARTER', 'Starter', 'Core POS for a small single-location business', 9900, 99000, 'QAR', true, true, 10, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'BUSINESS', 'Business', 'Operations, services, reporting and offline POS', 19900, 199000, 'QAR', true, true, 20, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'GROWTH', 'Growth', 'Multi-branch operations with higher limits', 34900, 349000, 'QAR', true, true, 30, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ENTERPRISE', 'Enterprise', 'Custom commercial terms and unlimited default limits', 0, 0, 'QAR', true, true, 40, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'LEGACY', 'Legacy', 'Internal grandfathered entitlement for pre-Phase-8 organizations', 0, 0, 'QAR', false, true, 1000, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "plan_features" ("id", "planId", "featureCode", "enabled")
SELECT gen_random_uuid(), p."id", f.code, true
FROM "plans" p
CROSS JOIN (VALUES
  ('pos'), ('inventory'), ('customers'), ('suppliers'), ('purchases'),
  ('expenses'), ('customer_credit'), ('reports'), ('reports_profit'),
  ('exports'), ('appointments'), ('commissions'), ('offline_pos'), ('multi_branch')
) AS f(code)
WHERE p."code" IN ('ENTERPRISE', 'LEGACY')
ON CONFLICT ("planId", "featureCode") DO NOTHING;

INSERT INTO "plan_limits" ("id", "planId", "limitCode", "value")
SELECT gen_random_uuid(), p."id", l.code, NULL
FROM "plans" p
CROSS JOIN (VALUES ('branches.max'), ('users.max'), ('devices.max'), ('products.max')) AS l(code)
WHERE p."code" IN ('ENTERPRISE', 'LEGACY')
ON CONFLICT ("planId", "limitCode") DO NOTHING;

INSERT INTO "subscriptions" ("id", "organizationId", "planId", "status", "billingInterval", "currency", "activatedAt", "updatedAt")
SELECT gen_random_uuid(), o."id", p."id", 'ACTIVE'::"SubscriptionStatus", 'CUSTOM'::"BillingInterval", o."currency", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organizations" o
CROSS JOIN "plans" p
WHERE p."code" = 'LEGACY'
ON CONFLICT ("organizationId") DO NOTHING;

ALTER TABLE "plans" ADD CONSTRAINT "plans_prices_nonnegative" CHECK ("monthlyPriceMinor" >= 0 AND "annualPriceMinor" >= 0);
ALTER TABLE "plan_limits" ADD CONSTRAINT "plan_limits_value_nonnegative" CHECK ("value" IS NULL OR "value" >= 0);
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_trial_dates_valid" CHECK ("trialStartedAt" IS NULL OR "trialEndsAt" IS NULL OR "trialEndsAt" > "trialStartedAt");
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_period_dates_valid" CHECK ("currentPeriodStart" IS NULL OR "currentPeriodEnd" IS NULL OR "currentPeriodEnd" > "currentPeriodStart");
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_amount_nonnegative" CHECK ("amountMinor" >= 0);
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_period_valid" CHECK ("periodEnd" > "periodStart");
