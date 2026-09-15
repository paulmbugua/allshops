import assert from "node:assert/strict";

import {
  createBranchSchema,
  createOrganizationSchema,
  createProductSchema,
  quantitySchema,
  decimalCurrencyToMinor,
  forgotPasswordSchema,
  resetPasswordSchema,
  submitReconciliationSchema,
} from "../src/index.js";

const invalidOrganization = createOrganizationSchema.safeParse({
  name: "Valid Shop",
  businessType: "UNSUPPORTED",
});
assert.equal(
  invalidOrganization.success,
  false,
  "unsupported business types must be rejected",
);

const invalidBranch = createBranchSchema.safeParse({
  name: "D",
});
assert.equal(
  invalidBranch.success,
  false,
  "branch names must satisfy the public identity policy",
);

assert.equal(
  quantitySchema.safeParse("2.5000").success,
  true,
  "decimal quantities with four places are supported",
);
assert.equal(
  quantitySchema.safeParse("2.50001").success,
  false,
  "quantity precision is capped at four decimal places",
);
assert.equal(
  createProductSchema.safeParse({
    name: "Consultation",
    unitId: "30b1889f-4d8d-4fe2-afed-ec40c3bed533",
    type: "SERVICE",
    trackInventory: true,
  }).success,
  false,
  "services cannot track stock",
);
assert.equal(
  decimalCurrencyToMinor("15.50"),
  1550,
  "currency parsing avoids floating-point arithmetic",
);

assert.equal(
  forgotPasswordSchema.safeParse({ email: "CASHIER@EXAMPLE.COM" }).success,
  true,
  "password recovery accepts and normalizes valid emails",
);
assert.equal(
  resetPasswordSchema.safeParse({ token: "x".repeat(43), password: "short" })
    .success,
  false,
  "password reset enforces the password policy",
);
assert.equal(
  submitReconciliationSchema.safeParse({
    date: "2026-09-15",
    branchId: "30b1889f-4d8d-4fe2-afed-ec40c3bed533",
    countedCashMinor: 125050,
  }).success,
  true,
  "cashier reconciliation uses a Qatar business date and integer minor units",
);

console.log("Contracts tests passed (9 assertions).");
