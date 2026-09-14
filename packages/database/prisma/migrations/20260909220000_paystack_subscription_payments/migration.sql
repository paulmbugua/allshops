ALTER TABLE "paystack_payment_intents"
  ALTER COLUMN "branchId" DROP NOT NULL,
  ADD COLUMN "billingRecordId" UUID,
  ADD COLUMN "sourceAmountMinor" INTEGER,
  ADD COLUMN "sourceCurrency" TEXT NOT NULL DEFAULT 'QAR';

UPDATE "paystack_payment_intents"
SET "sourceAmountMinor" = "amountMinor";

ALTER TABLE "paystack_payment_intents"
  ALTER COLUMN "sourceAmountMinor" SET NOT NULL,
  ADD CONSTRAINT "paystack_payment_intents_source_amount_positive"
  CHECK ("sourceAmountMinor" > 0);

CREATE UNIQUE INDEX "paystack_payment_intents_billingRecordId_key"
  ON "paystack_payment_intents"("billingRecordId");

ALTER TABLE "paystack_payment_intents"
  ADD CONSTRAINT "paystack_payment_intents_billingRecordId_fkey"
  FOREIGN KEY ("billingRecordId") REFERENCES "billing_records"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
