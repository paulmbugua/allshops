-- Kenya is the default market for newly created workspaces and records.
-- Existing financial rows are deliberately not relabelled or converted: doing
-- so would corrupt historical values. Operators can migrate legacy tenants as
-- a separately reviewed data exercise.
ALTER TABLE "organizations" ALTER COLUMN "currency" SET DEFAULT 'KES';
ALTER TABLE "organizations" ALTER COLUMN "timezone" SET DEFAULT 'Africa/Nairobi';
ALTER TABLE "branches" ALTER COLUMN "timezone" SET DEFAULT 'Africa/Nairobi';
ALTER TABLE "plans" ALTER COLUMN "currency" SET DEFAULT 'KES';
ALTER TABLE "subscriptions" ALTER COLUMN "currency" SET DEFAULT 'KES';
ALTER TABLE "sales" ALTER COLUMN "currency" SET DEFAULT 'KES';
ALTER TABLE "paystack_payment_intents" ALTER COLUMN "sourceCurrency" SET DEFAULT 'KES';
ALTER TABLE "paystack_payment_intents" ALTER COLUMN "currency" SET DEFAULT 'KES';
ALTER TABLE "purchases" ALTER COLUMN "currency" SET DEFAULT 'KES';
ALTER TABLE "expenses" ALTER COLUMN "currency" SET DEFAULT 'KES';

-- Plans are catalogue configuration rather than historical transactions, so
-- the public Kenyan price list can be updated safely. Issued billing records
-- keep their original currency and amount.
UPDATE "plans" SET "currency" = 'KES', "monthlyPriceMinor" = 150000, "annualPriceMinor" = 1500000 WHERE "code" = 'STARTER';
UPDATE "plans" SET "currency" = 'KES', "monthlyPriceMinor" = 300000, "annualPriceMinor" = 3000000 WHERE "code" = 'BUSINESS';
UPDATE "plans" SET "currency" = 'KES', "monthlyPriceMinor" = 550000, "annualPriceMinor" = 5500000 WHERE "code" = 'GROWTH';
UPDATE "plans" SET "currency" = 'KES' WHERE "code" IN ('ENTERPRISE', 'LEGACY');
