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
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const key = () => randomUUID();
const organizations: string[] = [];

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

async function organization(token: string, name: string) {
  const response = await request(server)
    .post("/api/v1/organizations")
    .set(bearer(token))
    .send({ name, businessType: "RETAIL" });
  assert.equal(response.status, 201);
  organizations.push(response.body.id);
  const branch = await request(server)
    .post(`/api/v1/organizations/${response.body.id}/branches`)
    .set(bearer(token))
    .send({
      name: "Main Branch",
      code: `P4_${randomUUID().slice(0, 8).toUpperCase()}`,
    });
  assert.equal(branch.status, 201);
  const location = await prisma.stockLocation.findFirstOrThrow({
    where: { branchId: branch.body.id, isDefault: true },
  });
  return {
    id: response.body.id as string,
    branchId: branch.body.id as string,
    locationId: location.id,
  };
}

async function invite(
  orgId: string,
  owner: string,
  email: string,
  roleId: string,
  branchId: string,
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
  const owner = await register(
    `phase4-owner-${suffix}@example.com`,
    "Phase 4 Owner",
  );
  const org = await organization(owner, "Phase 4 Store");
  const ownerUser = await prisma.user.findUniqueOrThrow({
    where: { email: `phase4-owner-${suffix}@example.com` },
  });
  const unit = await prisma.unit.findFirstOrThrow({
    where: { organizationId: org.id },
  });
  const roles = await request(server)
    .get(`/api/v1/organizations/${org.id}/roles`)
    .set(bearer(owner));
  const cashierRole = roles.body.find(
    (row: { code: string }) => row.code === "CASHIER",
  ).id;
  const cashier = await invite(
    org.id,
    owner,
    `phase4-cashier-${suffix}@example.com`,
    cashierRole,
    org.branchId,
  );

  async function product(
    name: string,
    priceMinor: number,
    type = "STOCK_ITEM",
  ) {
    const response = await request(server)
      .post(`/api/v1/organizations/${org.id}/products`)
      .set(bearer(owner))
      .send({
        name,
        type,
        unitId: unit.id,
        priceMinor,
        costMinor: 150,
        trackInventory: type === "STOCK_ITEM",
        sku: `${name.replaceAll(" ", "-").toUpperCase()}-${randomUUID().slice(0, 6)}`,
      });
    assert.equal(response.status, 201);
    return response.body.id as string;
  }

  const stockId = await product("Phase Four Cola", 300);
  const opening = await request(server)
    .post(`/api/v1/organizations/${org.id}/inventory/opening-stock`)
    .set(bearer(owner))
    .set("Idempotency-Key", key())
    .send({
      branchId: org.branchId,
      locationId: org.locationId,
      productId: stockId,
      quantity: "20",
    });
  assert.equal(opening.status, 201);

  const supplierEndpoint = `/api/v1/organizations/${org.id}/suppliers`;
  const supplierResponse = await request(server)
    .post(supplierEndpoint)
    .set(bearer(owner))
    .send({
      name: "Doha Beverages LLC",
      contactName: "Fatima",
      phone: "+97455550000",
    });
  assert.equal(supplierResponse.status, 201);
  const supplierId = supplierResponse.body.id as string;
  const supplierUpdate = await request(server)
    .patch(`${supplierEndpoint}/${supplierId}`)
    .set(bearer(owner))
    .send({ notes: "Preferred supplier" });
  assert.equal(supplierUpdate.status, 200);
  assert.equal(supplierUpdate.body.notes, "Preferred supplier");

  const foreignOwner = await register(
    `phase4-foreign-${suffix}@example.com`,
    "Foreign Owner",
  );
  const foreign = await organization(foreignOwner, "Foreign Phase 4 Store");
  const foreignSupplier = await request(server)
    .post(`/api/v1/organizations/${foreign.id}/suppliers`)
    .set(bearer(foreignOwner))
    .send({ name: "Foreign Supplier" });
  assert.equal(foreignSupplier.status, 201);
  assert.equal(
    (
      await request(server)
        .get(`${supplierEndpoint}/${foreignSupplier.body.id}`)
        .set(bearer(owner))
    ).status,
    404,
  );
  const foreignUnit = await prisma.unit.findFirstOrThrow({
    where: { organizationId: foreign.id },
  });
  const foreignProduct = await request(server)
    .post(`/api/v1/organizations/${foreign.id}/products`)
    .set(bearer(foreignOwner))
    .send({
      name: "Foreign Stock",
      type: "STOCK_ITEM",
      unitId: foreignUnit.id,
      priceMinor: 100,
      trackInventory: true,
    });
  assert.equal(foreignProduct.status, 201);

  const purchaseEndpoint = `/api/v1/organizations/${org.id}/purchases`;
  const purchasePayload = {
    branchId: org.branchId,
    supplierId,
    purchaseDate: "2026-09-08T00:00:00.000Z",
    supplierInvoiceNumber: "SUP-998",
    items: [{ productId: stockId, quantity: "100", unitCostMinor: 170 }],
  };
  assert.equal(
    (
      await request(server)
        .post(purchaseEndpoint)
        .set(bearer(owner))
        .send({ ...purchasePayload, supplierId: foreignSupplier.body.id })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(server)
        .post(purchaseEndpoint)
        .set(bearer(owner))
        .send({
          ...purchasePayload,
          items: [
            {
              productId: foreignProduct.body.id,
              quantity: "1",
              unitCostMinor: 100,
            },
          ],
        })
    ).status,
    404,
  );
  const purchase = await request(server)
    .post(purchaseEndpoint)
    .set(bearer(owner))
    .send(purchasePayload);
  assert.equal(purchase.status, 201);
  assert.match(purchase.body.purchaseNumber, /^PUR-\d{4}-\d{6}$/);
  assert.equal(purchase.body.totalMinor, 17_000);
  const purchaseId = purchase.body.id as string;
  const purchaseItemId = purchase.body.items[0].id as string;
  const receiveEndpoint = `${purchaseEndpoint}/${purchaseId}/receive`;
  const receiveKey = key();
  const receive60 = {
    locationId: org.locationId,
    items: [{ purchaseItemId, quantity: "60" }],
  };
  assert.equal(
    (
      await request(server)
        .post(receiveEndpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", receiveKey)
        .send(receive60)
    ).status,
    201,
  );
  const receiveRetry = await request(server)
    .post(receiveEndpoint)
    .set(bearer(owner))
    .set("Idempotency-Key", receiveKey)
    .send(receive60);
  assert.equal(receiveRetry.status, 201);
  assert.equal(receiveRetry.body.status, "PARTIALLY_RECEIVED");
  assert.equal(
    await prisma.stockMovement.count({
      where: { referenceId: purchaseId, movementType: "PURCHASE" },
    }),
    1,
  );
  assert.equal(
    (
      await request(server)
        .post(receiveEndpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", key())
        .send({
          locationId: org.locationId,
          items: [{ purchaseItemId, quantity: "41" }],
        })
    ).status,
    409,
  );
  const competingReceipts = await Promise.all(
    [key(), key()].map((idempotency) =>
      request(server)
        .post(receiveEndpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", idempotency)
        .send({
          locationId: org.locationId,
          items: [{ purchaseItemId, quantity: "40" }],
        }),
    ),
  );
  assert.deepEqual(
    competingReceipts.map((response) => response.status).sort(),
    [201, 409],
  );
  const received = await prisma.purchase.findUniqueOrThrow({
    where: { id: purchaseId },
    include: { items: true },
  });
  assert.equal(received.status, "RECEIVED");
  assert.equal(received.items[0]!.receivedQuantity.toString(), "100");
  const balance = await prisma.inventoryBalance.findFirstOrThrow({
    where: {
      organizationId: org.id,
      productId: stockId,
      locationId: org.locationId,
    },
  });
  assert.equal(balance.quantity.toString(), "120");
  assert.equal(
    (await prisma.product.findUniqueOrThrow({ where: { id: stockId } }))
      .costMinor,
    170,
  );
  assert.equal(
    (
      await request(server)
        .post(`${purchaseEndpoint}/${purchaseId}/cancel`)
        .set(bearer(owner))
    ).status,
    409,
  );

  const supplierPaymentEndpoint = `${supplierEndpoint}/${supplierId}/payments`;
  const paymentKey = key();
  const supplierPart = {
    purchaseId,
    amountMinor: 10_000,
    method: "BANK_TRANSFER",
    reference: "TRX-123",
  };
  const supplierPaid = await request(server)
    .post(supplierPaymentEndpoint)
    .set(bearer(owner))
    .set("Idempotency-Key", paymentKey)
    .send(supplierPart);
  assert.equal(supplierPaid.status, 201);
  assert.equal(
    (
      await request(server)
        .post(supplierPaymentEndpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", paymentKey)
        .send(supplierPart)
    ).body.id,
    supplierPaid.body.id,
  );
  assert.equal(
    (await prisma.purchase.findUniqueOrThrow({ where: { id: purchaseId } }))
      .balanceMinor,
    7_000,
  );
  assert.equal(
    (
      await request(server)
        .post(supplierPaymentEndpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", key())
        .send({ purchaseId, amountMinor: 7_000, method: "CASH" })
    ).status,
    201,
  );
  assert.equal(
    (await prisma.purchase.findUniqueOrThrow({ where: { id: purchaseId } }))
      .balanceMinor,
    0,
  );
  assert.equal(
    (
      await request(server)
        .post(supplierPaymentEndpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", key())
        .send({ purchaseId, amountMinor: 1, method: "CASH" })
    ).status,
    409,
  );

  const paymentRacePurchase = await request(server)
    .post(purchaseEndpoint)
    .set(bearer(owner))
    .send({
      ...purchasePayload,
      supplierInvoiceNumber: "RACE",
      items: [{ productId: stockId, quantity: "1", unitCostMinor: 500 }],
    });
  assert.equal(paymentRacePurchase.status, 201);
  const supplierRace = await Promise.all(
    [key(), key()].map((idempotency) =>
      request(server)
        .post(supplierPaymentEndpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", idempotency)
        .send({
          purchaseId: paymentRacePurchase.body.id,
          amountMinor: 400,
          method: "CASH",
        }),
    ),
  );
  assert.deepEqual(
    supplierRace.map((response) => response.status).sort(),
    [201, 409],
  );
  assert.equal(
    (
      await prisma.purchase.findUniqueOrThrow({
        where: { id: paymentRacePurchase.body.id },
      })
    ).balanceMinor,
    100,
  );

  const customerEndpoint = `/api/v1/organizations/${org.id}/customers`;
  const customerResponse = await request(server)
    .post(customerEndpoint)
    .set(bearer(owner))
    .send({
      name: "Ahmed Ali",
      phone: "+97455551111",
      creditLimitMinor: 100_000,
    });
  assert.equal(customerResponse.status, 201);
  const customerId = customerResponse.body.id as string;
  assert.equal(
    (
      await request(server)
        .patch(`${customerEndpoint}/${customerId}`)
        .set(bearer(owner))
        .send({ language: "ar" })
    ).status,
    200,
  );
  const foreignCustomer = await request(server)
    .post(`/api/v1/organizations/${foreign.id}/customers`)
    .set(bearer(foreignOwner))
    .send({ name: "Foreign Customer" });
  assert.equal(foreignCustomer.status, 201);
  assert.equal(
    (
      await request(server)
        .get(`${customerEndpoint}/${foreignCustomer.body.id}`)
        .set(bearer(owner))
    ).status,
    404,
  );

  const checkoutEndpoint = `/api/v1/organizations/${org.id}/sales/checkout`;
  const creditPayload = {
    branchId: org.branchId,
    customerId,
    items: [{ productId: stockId, quantity: "100" }],
    payments: [{ method: "CASH", amountMinor: 10_000 }],
  };
  assert.equal(
    (
      await request(server)
        .post(checkoutEndpoint)
        .set(bearer(cashier))
        .set("Idempotency-Key", key())
        .send(creditPayload)
    ).status,
    403,
  );
  assert.equal(
    (
      await request(server)
        .post(checkoutEndpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", key())
        .send({ ...creditPayload, customerId: undefined })
    ).status,
    409,
  );
  const creditKey = key();
  const creditSale = await request(server)
    .post(checkoutEndpoint)
    .set(bearer(owner))
    .set("Idempotency-Key", creditKey)
    .send(creditPayload);
  assert.equal(creditSale.status, 201);
  assert.equal(creditSale.body.paymentStatus, "PARTIALLY_PAID");
  assert.equal(creditSale.body.balanceMinor, 20_000);
  assert.equal(
    (
      await request(server)
        .post(checkoutEndpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", creditKey)
        .send(creditPayload)
    ).body.id,
    creditSale.body.id,
  );
  assert.equal(
    await prisma.customerLedgerEntry.count({
      where: { referenceId: creditSale.body.id },
    }),
    1,
  );
  assert.equal(
    await prisma.stockMovement.count({
      where: { movementType: "SALE", referenceId: creditSale.body.id },
    }),
    1,
  );
  assert.equal(
    (await prisma.customer.findUniqueOrThrow({ where: { id: customerId } }))
      .balanceMinor,
    20_000,
  );
  assert.equal(
    (
      await prisma.inventoryBalance.findFirstOrThrow({
        where: { locationId: org.locationId, productId: stockId },
      })
    ).quantity.toString(),
    "20",
  );

  const customerPaymentEndpoint = `${customerEndpoint}/${customerId}/payments`;
  const repaymentKey = key();
  const repayment = {
    amountMinor: 15_000,
    method: "BANK_TRANSFER",
    reference: "CUST-1",
  };
  const repaid = await request(server)
    .post(customerPaymentEndpoint)
    .set(bearer(owner))
    .set("Idempotency-Key", repaymentKey)
    .send(repayment);
  assert.equal(repaid.status, 201);
  assert.equal(
    (
      await request(server)
        .post(customerPaymentEndpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", repaymentKey)
        .send(repayment)
    ).body.id,
    repaid.body.id,
  );
  assert.equal(
    (await prisma.customer.findUniqueOrThrow({ where: { id: customerId } }))
      .balanceMinor,
    5_000,
  );
  assert.equal(
    (await prisma.sale.findUniqueOrThrow({ where: { id: creditSale.body.id } }))
      .balanceMinor,
    5_000,
  );
  assert.equal(
    (
      await request(server)
        .post(customerPaymentEndpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", key())
        .send({ amountMinor: 5_001, method: "CASH" })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(server)
        .post(customerPaymentEndpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", key())
        .send({ amountMinor: 5_000, method: "CASH" })
    ).status,
    201,
  );
  assert.equal(
    (await prisma.customer.findUniqueOrThrow({ where: { id: customerId } }))
      .balanceMinor,
    0,
  );
  assert.equal(
    (await prisma.sale.findUniqueOrThrow({ where: { id: creditSale.body.id } }))
      .paymentStatus,
    "PAID",
  );

  const serviceId = await product("Credit Service", 800, "SERVICE");
  const limitedCustomer = await request(server)
    .post(customerEndpoint)
    .set(bearer(owner))
    .send({ name: "Limited Customer", creditLimitMinor: 1_000 });
  const initialCredit = await request(server)
    .post(checkoutEndpoint)
    .set(bearer(owner))
    .set("Idempotency-Key", key())
    .send({
      branchId: org.branchId,
      customerId: limitedCustomer.body.id,
      items: [{ productId: serviceId, quantity: "1" }],
      payments: [],
    });
  assert.equal(initialCredit.status, 201);
  const smallServiceId = await product("Small Credit Service", 150, "SERVICE");
  const creditRace = await Promise.all(
    [key(), key()].map((idempotency) =>
      request(server)
        .post(checkoutEndpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", idempotency)
        .send({
          branchId: org.branchId,
          customerId: limitedCustomer.body.id,
          items: [{ productId: smallServiceId, quantity: "1" }],
          payments: [],
        }),
    ),
  );
  assert.deepEqual(
    creditRace.map((response) => response.status).sort(),
    [201, 409],
  );
  assert.equal(
    (
      await prisma.customer.findUniqueOrThrow({
        where: { id: limitedCustomer.body.id },
      })
    ).balanceMinor,
    950,
  );

  const repaymentCustomer = await request(server)
    .post(customerEndpoint)
    .set(bearer(owner))
    .send({ name: "Repayment Race", creditLimitMinor: 1_000 });
  const repaymentSale = await request(server)
    .post(checkoutEndpoint)
    .set(bearer(owner))
    .set("Idempotency-Key", key())
    .send({
      branchId: org.branchId,
      customerId: repaymentCustomer.body.id,
      items: [{ productId: smallServiceId, quantity: "1.3333" }],
      payments: [],
    });
  assert.equal(repaymentSale.status, 201);
  assert.equal(repaymentSale.body.totalMinor, 200);
  const repaymentRace = await Promise.all(
    [key(), key()].map((idempotency) =>
      request(server)
        .post(`${customerEndpoint}/${repaymentCustomer.body.id}/payments`)
        .set(bearer(owner))
        .set("Idempotency-Key", idempotency)
        .send({ amountMinor: 150, method: "CASH" }),
    ),
  );
  assert.deepEqual(
    repaymentRace.map((response) => response.status).sort(),
    [201, 409],
  );
  assert.equal(
    (
      await prisma.customer.findUniqueOrThrow({
        where: { id: repaymentCustomer.body.id },
      })
    ).balanceMinor,
    50,
  );

  const expenseCategoryEndpoint = `/api/v1/organizations/${org.id}/expense-categories`;
  const category = await request(server)
    .post(expenseCategoryEndpoint)
    .set(bearer(owner))
    .send({ name: "Electricity" });
  assert.equal(category.status, 201);
  assert.equal(
    (
      await request(server)
        .patch(`${expenseCategoryEndpoint}/${category.body.id}`)
        .set(bearer(owner))
        .send({ description: "Utility bills" })
    ).status,
    200,
  );
  const foreignCategory = await request(server)
    .post(`/api/v1/organizations/${foreign.id}/expense-categories`)
    .set(bearer(foreignOwner))
    .send({ name: "Foreign Expense" });
  const expenseEndpoint = `/api/v1/organizations/${org.id}/expenses`;
  const expensePayload = {
    branchId: org.branchId,
    categoryId: category.body.id,
    amountMinor: 125_000,
    paymentMethod: "BANK_TRANSFER",
    expenseDate: "2026-09-08T00:00:00.000Z",
    reference: "ELEC-1",
  };
  assert.equal(
    (
      await request(server)
        .post(expenseEndpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", key())
        .send({ ...expensePayload, branchId: foreign.branchId })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(server)
        .post(expenseEndpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", key())
        .send({ ...expensePayload, categoryId: foreignCategory.body.id })
    ).status,
    404,
  );
  const expenseKey = key();
  const expense = await request(server)
    .post(expenseEndpoint)
    .set(bearer(owner))
    .set("Idempotency-Key", expenseKey)
    .send(expensePayload);
  assert.equal(expense.status, 201);
  assert.equal(
    (
      await request(server)
        .post(expenseEndpoint)
        .set(bearer(owner))
        .set("Idempotency-Key", expenseKey)
        .send(expensePayload)
    ).body.id,
    expense.body.id,
  );
  assert.equal(
    await prisma.expense.count({ where: { id: expense.body.id } }),
    1,
  );

  const walkIn = await request(server)
    .post(checkoutEndpoint)
    .set(bearer(owner))
    .set("Idempotency-Key", key())
    .send({
      branchId: org.branchId,
      items: [{ productId: smallServiceId, quantity: "2" }],
      payments: [{ method: "CASH", amountMinor: 300 }],
    });
  assert.equal(walkIn.status, 201);
  assert.equal(walkIn.body.paymentStatus, "PAID");
  assert.equal(walkIn.body.customerId, null);
  assert.equal(
    await prisma.customerLedgerEntry.count({
      where: { referenceId: walkIn.body.id },
    }),
    0,
  );

  const reconciliation = await request(server)
    .get(`/api/v1/organizations/${org.id}/inventory/reconciliation`)
    .set(bearer(owner));
  assert.equal(reconciliation.status, 200);
  assert.equal(reconciliation.body.consistent, true);
  const customerLedger = await prisma.customerLedgerEntry.aggregate({
    where: { customerId },
    _sum: { debitMinor: true, creditMinor: true },
  });
  assert.equal(
    (customerLedger._sum.debitMinor ?? 0) -
      (customerLedger._sum.creditMinor ?? 0),
    (await prisma.customer.findUniqueOrThrow({ where: { id: customerId } }))
      .balanceMinor,
  );

  const rollbackCustomer = await prisma.customer.create({
    data: {
      organizationId: org.id,
      name: "Rollback Customer",
      creditLimitMinor: 1_000,
      createdBy: ownerUser.id,
    },
  });
  const membership = await prisma.organizationUser.findFirstOrThrow({
    where: { organizationId: org.id, userId: ownerUser.id },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
    },
  });
  const beforeCounts = await Promise.all([
    prisma.sale.count({ where: { customerId: rollbackCustomer.id } }),
    prisma.customerLedgerEntry.count({
      where: { customerId: rollbackCustomer.id },
    }),
  ]);
  await assert.rejects(() =>
    module.get(SalesService).checkout(
      {
        organizationId: org.id,
        membershipId: membership.id,
        roleId: membership.roleId,
        roleCode: membership.role.code,
        branchId: membership.branchId,
        permissions: membership.role.permissions.map(
          (row) => row.permission.code,
        ),
      },
      ownerUser.id,
      {
        branchId: org.branchId,
        customerId: rollbackCustomer.id,
        items: [{ productId: smallServiceId, quantity: "1" }],
        payments: [],
      },
      key(),
      { failAfterSale: true },
    ),
  );
  assert.deepEqual(
    await Promise.all([
      prisma.sale.count({ where: { customerId: rollbackCustomer.id } }),
      prisma.customerLedgerEntry.count({
        where: { customerId: rollbackCustomer.id },
      }),
    ]),
    beforeCounts,
  );

  console.log(
    "Phase 4 e2e passed: procurement, receiving, supplier payments, expenses, credit, repayments, concurrency, idempotency, tenancy, and regressions.",
  );
} finally {
  for (const organizationId of organizations.reverse())
    await prisma.organization
      .delete({ where: { id: organizationId } })
      .catch(() => undefined);
  await app.close();
}
