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
  upsertEtimsIntegrationSchema,
  upsertEtimsBranchSchema,
  upsertEtimsProductMappingSchema,
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
  "cashier reconciliation uses a Kenya business date and integer minor units",
);

assert.equal(
  upsertEtimsIntegrationSchema.safeParse({
    environment: "SANDBOX",
    status: "DRAFT",
    kraPin: "P051234567A",
    traderSystemName: "AllShops POS + ERP",
  }).success,
  true,
  "valid KRA integration identity is accepted",
);
assert.equal(
  upsertEtimsIntegrationSchema.safeParse({
    environment: "SANDBOX",
    status: "CERTIFIED",
    kraPin: "P051234567A",
    traderSystemName: "AllShops POS + ERP",
  }).success,
  false,
  "certified mode cannot accidentally target the sandbox",
);
assert.equal(
  upsertEtimsBranchSchema.safeParse({
    branchId: "30b1889f-4d8d-4fe2-afed-ec40c3bed533",
    kraBranchId: "00",
    deviceSerial: "ALLSHOPS-001",
  }).success,
  true,
  "KRA branch and device identifiers are validated",
);
assert.equal(
  upsertEtimsProductMappingSchema.safeParse({
    productId: "30b1889f-4d8d-4fe2-afed-ec40c3bed533",
    itemCode: "KE2NTXU0000001",
    itemClassCode: "5022110801",
    taxTypeCode: "B",
    taxRateBps: 1600,
  }).success,
  true,
  "Kenyan standard VAT mapping is accepted",
);

console.log("Contracts tests passed, including KRA eTIMS validation.");
