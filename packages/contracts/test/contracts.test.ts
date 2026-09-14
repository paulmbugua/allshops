import assert from "node:assert/strict";

import {
  createBranchSchema,
  createOrganizationSchema,
  createProductSchema,
  quantitySchema,
  decimalCurrencyToMinor,
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
  name: "Doha Branch",
  code: "lower case",
});
assert.equal(
  invalidBranch.success,
  false,
  "malformed branch codes must be rejected",
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

console.log("Contracts tests passed (6 assertions).");
