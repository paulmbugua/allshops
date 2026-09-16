import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { prisma } from "@allshops/database";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { configureApi } from "../src/configure-api.js";
import { SalesService } from "../src/sales.service.js";

const module = await Test.createTestingModule({
  imports: [AppModule],
}).compile();
const app = module.createNestApplication();
configureApi(app);
await app.init();
const server = app.getHttpServer();
const suffix = randomUUID().slice(0, 8);
const password = "StrongPass123!";
const emails = {
  owner: `phase3-owner-${suffix}@example.com`,
  foreign: `phase3-foreign-${suffix}@example.com`,
  cashier: `phase3-cashier-${suffix}@example.com`,
  manager: `phase3-manager-${suffix}@example.com`,
};
const organizations: string[] = [];
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const key = () => randomUUID();
async function register(email: string, name: string) {
  const response = await request(server)
    .post("/api/v1/auth/register")
    .send({ email, name, password });
  assert.equal(response.status, 201);
  const activated = await request(server)
    .post("/api/v1/auth/activate-account")
    .send({ token: response.body.activationToken });
  assert.equal(activated.status, 201);
  return activated.body.accessToken as string;
}
async function invite(
  orgId: string,
  owner: string,
  email: string,
  roleId: string,
  branchId: string | null,
) {
  const invited = await request(server)
    .post(`/api/v1/organizations/${orgId}/users`)
    .set(bearer(owner))
    .send({ name: email.split("@")[0], email, roleId, branchId });
  assert.equal(invited.status, 201);
  const accepted = await request(server)
    .post("/api/v1/auth/accept-invite")
    .send({ token: invited.body.invitationToken, password });
  assert.equal(accepted.status, 201);
  return accepted.body.accessToken as string;
}

try {
  const owner = await register(emails.owner, "Phase 3 Owner");
  const orgResponse = await request(server)
    .post("/api/v1/organizations")
    .set(bearer(owner))
    .send({
      name: "Phase 3 Store",
      arabicName: "متجر المرحلة الثالثة",
      businessType: "RETAIL",
    });
  assert.equal(orgResponse.status, 201);
  const orgId = orgResponse.body.id as string;
  organizations.push(orgId);
  const branchResponse = await request(server)
    .post(`/api/v1/organizations/${orgId}/branches`)
    .set(bearer(owner))
    .send({
      name: "Doha Main",
      code: `P3_${suffix.toUpperCase()}`,
      phone: "+974 5555 5555",
      address: "Doha, Qatar",
    });
  assert.equal(branchResponse.status, 201);
  const branchId = branchResponse.body.id as string;
  const locationId = (
    await prisma.stockLocation.findFirstOrThrow({
      where: { branchId, isDefault: true },
    })
  ).id;
  const unit = await prisma.unit.findFirstOrThrow({
    where: { organizationId: orgId },
  });
  const roles = await request(server)
    .get(`/api/v1/organizations/${orgId}/roles`)
    .set(bearer(owner));
  const role = (code: string) =>
    roles.body.find((row: { code: string }) => row.code === code).id as string;
  const cashier = await invite(
    orgId,
    owner,
    emails.cashier,
    role("CASHIER"),
    branchId,
  );
  const manager = await invite(
    orgId,
    owner,
    emails.manager,
    role("MANAGER"),
    branchId,
  );
  async function product(
    name: string,
    type: "STOCK_ITEM" | "SERVICE" | "NON_STOCK_ITEM",
    priceMinor: number,
    extra: object = {},
  ) {
    const response = await request(server)
      .post(`/api/v1/organizations/${orgId}/products`)
      .set(bearer(owner))
      .send({
        name,
        type,
        unitId: unit.id,
        priceMinor,
        costMinor: Math.floor(priceMinor / 2),
        ...extra,
      });
    assert.equal(response.status, 201);
    return response.body.id as string;
  }
  async function open(productId: string, quantity: string) {
    const response = await request(server)
      .post(`/api/v1/organizations/${orgId}/inventory/opening-stock`)
      .set(bearer(owner))
      .set("Idempotency-Key", key())
      .send({ branchId, locationId, productId, quantity });
    assert.equal(response.status, 201);
  }
  const stockId = await product("Receipt Cola", "STOCK_ITEM", 300, {
    sku: `COLA-${suffix}`,
    barcode: `629${suffix}`,
    trackInventory: true,
  });
  await open(stockId, "50");
  const serviceId = await product("Haircut", "SERVICE", 2500);
  const nonStockId = await product("Gift wrap", "NON_STOCK_ITEM", 200);
  const endpoint = `/api/v1/organizations/${orgId}/sales/checkout`;
  const simple = {
    branchId,
    items: [{ productId: stockId, quantity: "2" }],
    payments: [{ method: "CASH", amountMinor: 600 }],
  };
  assert.equal(
    (await request(server).post(endpoint).set(bearer(cashier)).send(simple))
      .status,
    400,
    "idempotency key is mandatory",
  );
  const idempotency = key();
  const first = await request(server)
    .post(endpoint)
    .set(bearer(cashier))
    .set("Idempotency-Key", idempotency)
    .send(simple);
  assert.equal(first.status, 201);
  assert.match(first.body.invoiceNumber, /^INV-\d{4}-\d{6}$/);
  const retry = await request(server)
    .post(endpoint)
    .set(bearer(cashier))
    .set("Idempotency-Key", idempotency)
    .send(simple);
  assert.equal(retry.status, 201);
  assert.equal(retry.body.id, first.body.id);
  assert.equal(await prisma.sale.count({ where: { id: first.body.id } }), 1);
  assert.equal(
    await prisma.payment.count({ where: { saleId: first.body.id } }),
    1,
  );
  assert.equal(
    await prisma.stockMovement.count({
      where: { referenceId: first.body.id, movementType: "SALE" },
    }),
    1,
  );
  const second = await request(server)
    .post(endpoint)
    .set(bearer(cashier))
    .set("Idempotency-Key", key())
    .send(simple);
  assert.equal(second.status, 201);
  assert.notEqual(second.body.id, first.body.id);
  const foreignOwner = await register(emails.foreign, "Foreign Owner");
  const foreignOrg = await request(server)
    .post("/api/v1/organizations")
    .set(bearer(foreignOwner))
    .send({ name: "Foreign Store", businessType: "RETAIL" });
  organizations.push(foreignOrg.body.id);
  const foreignBranch = await request(server)
    .post(`/api/v1/organizations/${foreignOrg.body.id}/branches`)
    .set(bearer(foreignOwner))
    .send({ name: "Foreign", code: `F_${suffix.toUpperCase()}` });
  assert.equal(
    (
      await request(server)
        .post(endpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", key())
        .send({ ...simple, branchId: foreignBranch.body.id })
    ).status,
    404,
  );
  const foreignDevice = await prisma.device.create({
    data: {
      organizationId: foreignOrg.body.id,
      branchId: foreignBranch.body.id,
      name: "Foreign terminal",
      deviceUuid: randomUUID(),
    },
  });
  assert.equal(
    (
      await request(server)
        .post(endpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", key())
        .send({ ...simple, deviceId: foreignDevice.id })
    ).status,
    404,
  );
  const foreignUnit = await prisma.unit.findFirstOrThrow({
    where: { organizationId: foreignOrg.body.id },
  });
  const foreignProduct = await request(server)
    .post(`/api/v1/organizations/${foreignOrg.body.id}/products`)
    .set(bearer(foreignOwner))
    .send({
      name: "Foreign item",
      type: "NON_STOCK_ITEM",
      unitId: foreignUnit.id,
      priceMinor: 100,
    });
  assert.equal(
    (
      await request(server)
        .post(endpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", key())
        .send({
          branchId,
          items: [{ productId: foreignProduct.body.id, quantity: "1" }],
          payments: [{ method: "CASH", amountMinor: 100 }],
        })
    ).status,
    404,
  );
  const variant = await request(server)
    .post(`/api/v1/organizations/${orgId}/products/${stockId}/variants`)
    .set(bearer(owner))
    .send({
      name: "Large",
      sku: `LARGE-${suffix}`,
      barcode: `629L${suffix}`,
      priceMinor: 450,
    });
  assert.equal(variant.status, 201);
  assert.equal(
    (
      await request(server)
        .post(endpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", key())
        .send({
          branchId,
          items: [
            { productId: serviceId, variantId: variant.body.id, quantity: "1" },
          ],
          payments: [{ method: "CASH", amountMinor: 2500 }],
        })
    ).status,
    404,
  );
  const inactiveId = await product("Inactive", "NON_STOCK_ITEM", 100);
  await request(server)
    .patch(`/api/v1/organizations/${orgId}/products/${inactiveId}`)
    .set(bearer(owner))
    .send({ isActive: false });
  assert.equal(
    (
      await request(server)
        .post(endpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", key())
        .send({
          branchId,
          items: [{ productId: inactiveId, quantity: "1" }],
          payments: [{ method: "CASH", amountMinor: 100 }],
        })
    ).status,
    409,
  );
  const cancelledHeld = await request(server)
    .post(`/api/v1/organizations/${orgId}/sales/held`)
    .set(bearer(cashier))
    .send({ branchId, items: [{ productId: serviceId, quantity: "1" }] });
  assert.equal(cancelledHeld.status, 201);
  const cancelled = await request(server)
    .post(
      `/api/v1/organizations/${orgId}/sales/${cancelledHeld.body.id}/cancel`,
    )
    .set(bearer(cashier));
  assert.equal(cancelled.status, 201);
  assert.equal(cancelled.body.status, "CANCELLED");
  assert.equal(cancelled.body.invoiceNumber, null);
  assert.equal(
    await prisma.payment.count({ where: { saleId: cancelled.body.id } }),
    0,
  );
  const filteredSales = await request(server)
    .get(`/api/v1/organizations/${orgId}/sales?status=CANCELLED&pageSize=100`)
    .set(bearer(cashier));
  assert.equal(filteredSales.status, 200);
  assert.equal(
    filteredSales.body.items.some(
      (row: { id: string }) => row.id === cancelled.body.id,
    ),
    true,
  );
  const scarceId = await product("Scarce", "STOCK_ITEM", 1000, {
    trackInventory: true,
  });
  await open(scarceId, "1");
  const beforeFailed = await prisma.sale.count({
    where: { organizationId: orgId },
  });
  assert.equal(
    (
      await request(server)
        .post(endpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", key())
        .send({
          branchId,
          items: [{ productId: scarceId, quantity: "2" }],
          payments: [{ method: "CASH", amountMinor: 2000 }],
        })
    ).status,
    409,
  );
  assert.equal(
    await prisma.sale.count({ where: { organizationId: orgId } }),
    beforeFailed,
  );
  const negativeId = await product("Backorder", "STOCK_ITEM", 700, {
    trackInventory: true,
    allowNegativeStock: true,
  });
  const negative = await request(server)
    .post(endpoint)
    .set(bearer(owner))
    .set("Idempotency-Key", key())
    .send({
      branchId,
      items: [{ productId: negativeId, quantity: "2.5" }],
      payments: [{ method: "CASH", amountMinor: 1750 }],
    });
  assert.equal(negative.status, 201);
  assert.equal(
    (
      await prisma.inventoryBalance.findFirstOrThrow({
        where: { productId: negativeId },
      })
    ).quantity.toString(),
    "-2.5",
  );
  const mixed = await request(server)
    .post(endpoint)
    .set(bearer(owner))
    .set("Idempotency-Key", key())
    .send({
      branchId,
      items: [
        { productId: stockId, quantity: "1" },
        { productId: serviceId, quantity: "1" },
        { productId: nonStockId, quantity: "1" },
      ],
      payments: [{ method: "CARD", amountMinor: 3000 }],
    });
  assert.equal(mixed.status, 201);
  assert.equal(
    await prisma.stockMovement.count({
      where: { referenceId: mixed.body.id, movementType: "SALE" },
    }),
    1,
  );
  const split = await request(server)
    .post(endpoint)
    .set(bearer(owner))
    .set("Idempotency-Key", key())
    .send({
      branchId,
      items: [{ productId: serviceId, quantity: "4" }],
      payments: [
        { method: "CASH", amountMinor: 4000 },
        { method: "CARD", amountMinor: 6000, reference: "TERM-1" },
      ],
    });
  assert.equal(split.status, 201);
  assert.equal(split.body.payments.length, 2);
  assert.equal(
    split.body.payments.reduce(
      (sum: number, row: { amountMinor: number }) => sum + row.amountMinor,
      0,
    ),
    10000,
  );
  assert.equal(
    (
      await request(server)
        .post(endpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", key())
        .send({
          branchId,
          items: [{ productId: nonStockId, quantity: "1" }],
          payments: [{ method: "CASH", amountMinor: 199 }],
        })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(server)
        .post(endpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", key())
        .send({
          branchId,
          items: [{ productId: nonStockId, quantity: "1" }],
          payments: [{ method: "CARD", amountMinor: 250 }],
        })
    ).status,
    409,
  );
  const cashChange = await request(server)
    .post(endpoint)
    .set(bearer(owner))
    .set("Idempotency-Key", key())
    .send({
      branchId,
      items: [{ productId: nonStockId, quantity: "1" }],
      payments: [{ method: "CASH", amountMinor: 250 }],
    });
  assert.equal(cashChange.status, 201);
  assert.equal(cashChange.body.paidMinor, 250);
  assert.equal(cashChange.body.changeMinor, 50);
  assert.equal(cashChange.body.payments[0].amountMinor, 200);
  assert.equal(cashChange.body.payments[0].tenderedMinor, 250);
  const fixed = await request(server)
    .post(endpoint)
    .set(bearer(manager))
    .set("Idempotency-Key", key())
    .send({
      branchId,
      items: [{ productId: serviceId, quantity: "1" }],
      discount: { type: "FIXED", valueMinor: 500 },
      payments: [{ method: "CASH", amountMinor: 2000 }],
    });
  assert.equal(fixed.status, 201);
  assert.equal(fixed.body.discountMinor, 500);
  const percent = await request(server)
    .post(endpoint)
    .set(bearer(manager))
    .set("Idempotency-Key", key())
    .send({
      branchId,
      items: [{ productId: serviceId, quantity: "1" }],
      discount: { type: "PERCENTAGE", basisPoints: 1000 },
      payments: [{ method: "CASH", amountMinor: 2250 }],
    });
  assert.equal(percent.status, 201);
  assert.equal(percent.body.discountMinor, 250);
  assert.equal(
    (
      await request(server)
        .post(endpoint)
        .set(bearer(cashier))
        .set("Idempotency-Key", key())
        .send({
          branchId,
          items: [{ productId: serviceId, quantity: "1" }],
          discount: { type: "FIXED", valueMinor: 100 },
          payments: [{ method: "CASH", amountMinor: 2400 }],
        })
    ).status,
    403,
  );
  const concurrencyId = await product("Last item", "STOCK_ITEM", 900, {
    trackInventory: true,
  });
  await open(concurrencyId, "1");
  const concurrentPayload = {
    branchId,
    items: [{ productId: concurrencyId, quantity: "1" }],
    payments: [{ method: "CASH", amountMinor: 900 }],
  };
  const races = await Promise.all([
    request(server)
      .post(endpoint)
      .set(bearer(owner))
      .set("Idempotency-Key", key())
      .send(concurrentPayload),
    request(server)
      .post(endpoint)
      .set(bearer(owner))
      .set("Idempotency-Key", key())
      .send(concurrentPayload),
  ]);
  assert.deepEqual(races.map((row) => row.status).sort(), [201, 409]);
  assert.equal(
    (
      await prisma.inventoryBalance.findFirstOrThrow({
        where: { productId: concurrencyId },
      })
    ).quantity.toString(),
    "0",
  );
  assert.equal(
    await prisma.stockMovement.count({
      where: { productId: concurrencyId, movementType: "SALE" },
    }),
    1,
  );
  const invoiceSales = await Promise.all(
    Array.from({ length: 5 }, () =>
      request(server)
        .post(endpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", key())
        .send({
          branchId,
          items: [{ productId: serviceId, quantity: "1" }],
          payments: [{ method: "CASH", amountMinor: 2500 }],
        }),
    ),
  );
  assert.equal(
    invoiceSales.every((row) => row.status === 201),
    true,
  );
  assert.equal(
    new Set(invoiceSales.map((row) => row.body.invoiceNumber)).size,
    5,
  );
  const held = await request(server)
    .post(`/api/v1/organizations/${orgId}/sales/held`)
    .set(bearer(cashier))
    .send({ branchId, items: [{ productId: stockId, quantity: "1" }] });
  assert.equal(held.status, 201);
  assert.equal(held.body.invoiceNumber, null);
  assert.equal(held.body.payments.length, 0);
  assert.equal(
    await prisma.stockMovement.count({ where: { referenceId: held.body.id } }),
    0,
  );
  const heldComplete = await request(server)
    .post(`/api/v1/organizations/${orgId}/sales/${held.body.id}/complete`)
    .set(bearer(cashier))
    .set("Idempotency-Key", key())
    .send({ payments: [{ method: "CASH", amountMinor: 300 }] });
  assert.equal(heldComplete.status, 201);
  assert.ok(heldComplete.body.invoiceNumber);
  assert.equal(
    (
      await request(server)
        .post(`/api/v1/organizations/${orgId}/sales/${held.body.id}/cancel`)
        .set(bearer(cashier))
    ).status,
    409,
  );
  const ownerUser = await prisma.user.findUniqueOrThrow({
    where: { email: emails.owner },
  });
  const saleService = module.get(SalesService);
  const saleCount = await prisma.sale.count({
    where: { organizationId: orgId },
  });
  await assert.rejects(
    () =>
      saleService.checkout(
        {
          organizationId: orgId,
          membershipId: "test",
          roleId: "test",
          roleCode: "OWNER",
          branchId: null,
          permissions: ["sale.discount", "product.cost.read"],
        },
        ownerUser.id,
        {
          branchId,
          items: [{ productId: serviceId, quantity: "1" }],
          payments: [{ method: "CASH", amountMinor: 2500 }],
        },
        key(),
        { failAfterSale: true },
      ),
    /PHASE3_TEST_ROLLBACK/,
  );
  assert.equal(
    await prisma.sale.count({ where: { organizationId: orgId } }),
    saleCount,
  );
  await request(server)
    .patch(`/api/v1/organizations/${orgId}/products/${stockId}`)
    .set(bearer(owner))
    .send({ name: "Renamed Cola", priceMinor: 999 });
  const receipt = await request(server)
    .get(`/api/v1/organizations/${orgId}/sales/${first.body.id}/receipt`)
    .set(bearer(cashier));
  assert.equal(receipt.status, 200);
  assert.equal(receipt.body.items[0].productNameSnapshot, "Receipt Cola");
  assert.equal(receipt.body.items[0].unitPriceMinor, 300);
  assert.equal("unitCostMinor" in receipt.body.items[0], false);
  assert.equal(
    (
      await request(server)
        .get(
          `/api/v1/organizations/${foreignOrg.body.id}/sales/${first.body.id}`,
        )
        .set(bearer(foreignOwner))
    ).status,
    404,
  );
  const pos = await request(server)
    .get(`/api/v1/organizations/${orgId}/pos/products?branchId=${branchId}`)
    .set(bearer(cashier));
  assert.equal(pos.status, 200);
  assert.equal(
    pos.body.items.every((row: object) => !("costMinor" in row)),
    true,
  );
  const ownerPosBranches = await request(server)
    .get(`/api/v1/organizations/${orgId}/pos/branches`)
    .set(bearer(owner));
  assert.equal(ownerPosBranches.status, 200);
  assert.equal(
    ownerPosBranches.body.some(
      (row: { id: string }) => row.id === branchId,
    ),
    true,
  );
  const cashierPosBranches = await request(server)
    .get(`/api/v1/organizations/${orgId}/pos/branches`)
    .set(bearer(cashier));
  assert.equal(cashierPosBranches.status, 200);
  assert.deepEqual(
    cashierPosBranches.body.map((row: { id: string }) => row.id),
    [branchId],
  );
  const barcodeLookup = await request(server)
    .get(
      `/api/v1/organizations/${orgId}/pos/products/barcode?branchId=${branchId}&barcode=629${suffix}`,
    )
    .set(bearer(cashier));
  assert.equal(barcodeLookup.status, 200);
  assert.equal(barcodeLookup.body.productId, stockId);
  assert.equal(barcodeLookup.body.variantId, null);
  assert.equal(barcodeLookup.body.barcode, `629${suffix}`);
  assert.equal("costMinor" in barcodeLookup.body, false);
  const variantBarcodeLookup = await request(server)
    .get(
      `/api/v1/organizations/${orgId}/pos/products/barcode?branchId=${branchId}&barcode=629L${suffix}`,
    )
    .set(bearer(cashier));
  assert.equal(variantBarcodeLookup.status, 200);
  assert.equal(variantBarcodeLookup.body.productId, stockId);
  assert.equal(variantBarcodeLookup.body.variantId, variant.body.id);
  assert.equal(
    (
      await request(server)
        .get(
          `/api/v1/organizations/${orgId}/pos/products/barcode?branchId=${branchId}&barcode=UNKNOWN-${suffix}`,
        )
        .set(bearer(cashier))
    ).body,
    null,
  );
  const reconciliation = await request(server)
    .get(`/api/v1/organizations/${orgId}/inventory/reconciliation`)
    .set(bearer(owner));
  assert.equal(reconciliation.status, 200);
  assert.equal(reconciliation.body.consistent, true);
  console.log(
    "Phase 3 e2e passed: checkout atomicity, payments, discounts, idempotency, concurrency, held sales, receipts, tenancy, RBAC, and reconciliation.",
  );
} finally {
  await prisma.payment.deleteMany({
    where: { organizationId: { in: organizations } },
  });
  await prisma.saleItem.deleteMany({
    where: { organizationId: { in: organizations } },
  });
  await prisma.sale.deleteMany({
    where: { organizationId: { in: organizations } },
  });
  await prisma.invoiceSequence.deleteMany({
    where: { organizationId: { in: organizations } },
  });
  await prisma.stockTransfer.deleteMany({
    where: { organizationId: { in: organizations } },
  });
  await prisma.stockMovement.deleteMany({
    where: { organizationId: { in: organizations } },
  });
  await prisma.inventoryBalance.deleteMany({
    where: { organizationId: { in: organizations } },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: organizations } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: Object.values(emails) } },
  });
  await app.close();
}
