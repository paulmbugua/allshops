import assert from "node:assert/strict";

import { BadRequestException } from "@nestjs/common";

import {
  calculateInclusiveTaxMinor,
  calculateSaleTotals,
} from "../src/sales.service.js";

assert.deepEqual(calculateSaleTotals([{ grossMinor: 1_001 }], null), {
  subtotalMinor: 1_001,
  discountMinor: 0,
  taxMinor: 0,
  totalMinor: 1_001,
  discountType: null,
  discountValue: null,
});

assert.deepEqual(
  calculateSaleTotals([{ grossMinor: 1_001 }, { grossMinor: 499 }], {
    type: "FIXED",
    valueMinor: 125,
  }),
  {
    subtotalMinor: 1_500,
    discountMinor: 125,
    taxMinor: 0,
    totalMinor: 1_375,
    discountType: "FIXED",
    discountValue: 125,
  },
);

assert.deepEqual(
  calculateSaleTotals([{ grossMinor: 1_005 }], {
    type: "PERCENTAGE",
    basisPoints: 1_250,
  }),
  {
    subtotalMinor: 1_005,
    discountMinor: 126,
    taxMinor: 0,
    totalMinor: 879,
    discountType: "PERCENTAGE",
    discountValue: 1_250,
  },
);

assert.throws(
  () =>
    calculateSaleTotals([{ grossMinor: 100 }], {
      type: "FIXED",
      valueMinor: 101,
    }),
  BadRequestException,
);

assert.equal(
  calculateInclusiveTaxMinor(11_600, 1_600),
  1_600,
  "16% VAT is extracted correctly from a tax-inclusive KES 116.00 price",
);
assert.equal(
  calculateInclusiveTaxMinor(10_000, 0),
  0,
  "zero-rated, exempt, and non-VAT lines do not invent tax",
);

console.log(
  "Phase 3 unit test passed: fixed and percentage sale totals are deterministic.",
);
