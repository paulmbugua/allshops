import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { Test } from "@nestjs/testing";
import { Prisma, prisma } from "@allshops/database";
import request from "supertest";

import { AppModule } from "../src/app.module.js";
import { configureApi } from "../src/configure-api.js";

const module = await Test.createTestingModule({
  imports: [AppModule],
}).compile();
const app = module.createNestApplication();
configureApi(app);
await app.init();

const suffix = randomUUID().slice(0, 8);
const password = "StrongPass123!";
const emails = {
  ownerA: `phase2-owner-a-${suffix}@example.com`,
  ownerB: `phase2-owner-b-${suffix}@example.com`,
  manager: `phase2-manager-${suffix}@example.com`,
  cashier: `phase2-cashier-${suffix}@example.com`,
  auditor: `phase2-auditor-${suffix}@example.com`,
};
const organizationIds: string[] = [];
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const idem = () => ({ "Idempotency-Key": randomUUID() });

async function register(email: string, name: string) {
  const response = await request(app.getHttpServer())
    .post("/api/v1/auth/register")
    .send({ email, name, password });
  assert.equal(response.status, 201);
  return response.body.accessToken as string;
}

async function invite(
  orgId: string,
  ownerToken: string,
  name: string,
  email: string,
  roleId: string,
  branchId: string | null,
) {
  const response = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgId}/users`)
    .set(bearer(ownerToken))
    .send({ name, email, roleId, branchId });
  assert.equal(response.status, 201);
  const accepted = await request(app.getHttpServer())
    .post("/api/v1/auth/accept-invite")
    .send({ token: response.body.invitationToken, password });
  assert.equal(accepted.status, 201);
  return accepted.body.accessToken as string;
}

try {
  const ownerA = await register(emails.ownerA, "Catalogue Owner A");
  const createdOrgA = await request(app.getHttpServer())
    .post("/api/v1/organizations")
    .set(bearer(ownerA))
    .send({ name: "Phase 2 Market A", businessType: "GROCERY" });
  assert.equal(createdOrgA.status, 201);
  const orgA = createdOrgA.body.id as string;
  organizationIds.push(orgA);

  const branchAResponse = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/branches`)
    .set(bearer(ownerA))
    .send({ name: "Main Branch", code: `MAIN_${suffix.toUpperCase()}` });
  assert.equal(branchAResponse.status, 201);
  const branchA = branchAResponse.body.id as string;
  const locationsA = await request(app.getHttpServer())
    .get(`/api/v1/organizations/${orgA}/stock-locations?branchId=${branchA}`)
    .set(bearer(ownerA));
  assert.equal(locationsA.status, 200);
  assert.equal(locationsA.body.length, 1);
  assert.equal(locationsA.body[0].isDefault, true);
  const locationA = locationsA.body[0].id as string;

  const ownerB = await register(emails.ownerB, "Catalogue Owner B");
  const createdOrgB = await request(app.getHttpServer())
    .post("/api/v1/organizations")
    .set(bearer(ownerB))
    .send({ name: "Phase 2 Market B", businessType: "RETAIL" });
  assert.equal(createdOrgB.status, 201);
  const orgB = createdOrgB.body.id as string;
  organizationIds.push(orgB);
  const branchBResponse = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgB}/branches`)
    .set(bearer(ownerB))
    .send({ name: "Foreign Branch", code: `FOREIGN_${suffix.toUpperCase()}` });
  const branchB = branchBResponse.body.id as string;
  const locationB = (
    await prisma.stockLocation.findFirstOrThrow({
      where: { branchId: branchB, isDefault: true },
    })
  ).id;

  const category = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/categories`)
    .set(bearer(ownerA))
    .send({ name: "Beverages", arabicName: "مشروبات" });
  assert.equal(category.status, 201);
  const child = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/categories`)
    .set(bearer(ownerA))
    .send({ name: "Soft Drinks", parentId: category.body.id });
  assert.equal(child.status, 201);
  const duplicateCategory = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/categories`)
    .set(bearer(ownerA))
    .send({ name: " beverages " });
  assert.equal(duplicateCategory.status, 409);
  const brand = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/brands`)
    .set(bearer(ownerA))
    .send({ name: "Coca-Cola" });
  assert.equal(brand.status, 201);
  const unit = await prisma.unit.findFirstOrThrow({
    where: { organizationId: orgA, normalizedName: "piece" },
  });
  const createdUnit = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/units`)
    .set(bearer(ownerA))
    .send({ name: "Carton", symbol: "ctn" });
  assert.equal(createdUnit.status, 201);

  const foreignCategory = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgB}/categories`)
    .set(bearer(ownerB))
    .send({ name: "Foreign Catalogue" });
  assert.equal(foreignCategory.status, 201);
  const foreignReference = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/products`)
    .set(bearer(ownerA))
    .send({
      name: "Attack",
      type: "STOCK_ITEM",
      unitId: unit.id,
      categoryId: foreignCategory.body.id,
    });
  assert.equal(foreignReference.status, 404);

  const serviceInvalid = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/products`)
    .set(bearer(ownerA))
    .send({
      name: "Car Wash",
      type: "SERVICE",
      unitId: unit.id,
      trackInventory: true,
    });
  assert.equal(serviceInvalid.status, 400);
  const serviceProduct = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/products`)
    .set(bearer(ownerA))
    .send({
      name: "Car Wash",
      type: "SERVICE",
      unitId: unit.id,
      priceMinor: 2500,
    });
  assert.equal(serviceProduct.status, 201);
  assert.equal(serviceProduct.body.trackInventory, false);

  const productResponse = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/products`)
    .set(bearer(ownerA))
    .send({
      name: "Coca-Cola 330ml",
      arabicName: "كوكا كولا",
      categoryId: category.body.id,
      brandId: brand.body.id,
      unitId: unit.id,
      type: "STOCK_ITEM",
      sku: "COKE330",
      barcode: "123456789",
      costMinor: 150,
      priceMinor: 300,
      trackInventory: true,
      minimumStock: "10.0000",
    });
  assert.equal(productResponse.status, 201);
  const productId = productResponse.body.id as string;
  const duplicateSku = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/products`)
    .set(bearer(ownerA))
    .send({
      name: "Duplicate SKU",
      unitId: unit.id,
      type: "STOCK_ITEM",
      sku: "coke330",
    });
  assert.equal(duplicateSku.status, 409);
  const duplicateBarcode = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/products`)
    .set(bearer(ownerA))
    .send({
      name: "Duplicate barcode",
      unitId: unit.id,
      type: "STOCK_ITEM",
      barcode: "123456789",
    });
  assert.equal(duplicateBarcode.status, 409);

  const variant = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/products/${productId}/variants`)
    .set(bearer(ownerA))
    .send({
      name: "Zero Sugar",
      attributes: { recipe: "Zero" },
      sku: "COKE330-ZERO",
      priceMinor: 325,
    });
  assert.equal(variant.status, 201);
  assert.equal(variant.body.priceMinor, 325);

  const roles = await request(app.getHttpServer())
    .get(`/api/v1/organizations/${orgA}/roles`)
    .set(bearer(ownerA));
  const role = (code: string) =>
    roles.body.find((item: { code: string }) => item.code === code)
      .id as string;
  const managerToken = await invite(
    orgA,
    ownerA,
    "Inventory Manager",
    emails.manager,
    role("INVENTORY_MANAGER"),
    branchA,
  );
  const cashierToken = await invite(
    orgA,
    ownerA,
    "Cashier",
    emails.cashier,
    role("CASHIER"),
    branchA,
  );
  const auditorToken = await invite(
    orgA,
    ownerA,
    "Auditor",
    emails.auditor,
    role("AUDITOR"),
    null,
  );
  const managerProduct = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/products`)
    .set(bearer(managerToken))
    .send({
      name: "Manager-created item",
      unitId: unit.id,
      type: "STOCK_ITEM",
      sku: `MGR-${suffix}`,
    });
  assert.equal(managerProduct.status, 201);

  const openingKey = idem();
  const openingPayload = {
    branchId: branchA,
    locationId: locationA,
    productId,
    quantity: "100.0000",
    unitCostMinor: 150,
  };
  const opening = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/inventory/opening-stock`)
    .set(bearer(ownerA))
    .set(openingKey)
    .send(openingPayload);
  assert.equal(opening.status, 201);
  const openingRetry = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/inventory/opening-stock`)
    .set(bearer(ownerA))
    .set(openingKey)
    .send(openingPayload);
  assert.equal(openingRetry.status, 201);
  assert.equal(
    await prisma.stockMovement.count({
      where: { organizationId: orgA, productId, movementType: "OPENING" },
    }),
    1,
  );
  const repeatedOpening = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/inventory/opening-stock`)
    .set(bearer(ownerA))
    .set(idem())
    .send(openingPayload);
  assert.equal(repeatedOpening.status, 409);

  const adjustment = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/inventory/adjustments`)
    .set(bearer(managerToken))
    .set(idem())
    .send({
      branchId: branchA,
      locationId: locationA,
      productId,
      direction: "OUT",
      quantity: "5",
      reason: "Damaged stock",
    });
  assert.equal(adjustment.status, 201);
  assert.equal(adjustment.body.quantity, "-5");
  const insufficient = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/inventory/adjustments`)
    .set(bearer(managerToken))
    .send({
      branchId: branchA,
      locationId: locationA,
      productId,
      direction: "OUT",
      quantity: "200",
      reason: "Must fail",
    });
  assert.equal(insufficient.status, 409);

  const negativeProduct = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/products`)
    .set(bearer(ownerA))
    .send({
      name: "Backorder item",
      unitId: unit.id,
      type: "STOCK_ITEM",
      sku: `NEG-${suffix}`,
      trackInventory: true,
      allowNegativeStock: true,
    });
  assert.equal(negativeProduct.status, 201);
  const negativeAdjustment = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/inventory/adjustments`)
    .set(bearer(managerToken))
    .send({
      branchId: branchA,
      locationId: locationA,
      productId: negativeProduct.body.id,
      direction: "OUT",
      quantity: "2.5",
      reason: "Allowed backorder",
    });
  assert.equal(negativeAdjustment.status, 201);

  const concurrentProduct = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/products`)
    .set(bearer(ownerA))
    .send({
      name: "Concurrency item",
      unitId: unit.id,
      type: "STOCK_ITEM",
      sku: `CON-${suffix}`,
      trackInventory: true,
    });
  await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/inventory/opening-stock`)
    .set(bearer(ownerA))
    .send({
      branchId: branchA,
      locationId: locationA,
      productId: concurrentProduct.body.id,
      quantity: "10",
    });
  const reductions = await Promise.all([
    request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgA}/inventory/adjustments`)
      .set(bearer(managerToken))
      .send({
        branchId: branchA,
        locationId: locationA,
        productId: concurrentProduct.body.id,
        direction: "OUT",
        quantity: "7",
        reason: "Concurrent one",
      }),
    request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgA}/inventory/adjustments`)
      .set(bearer(managerToken))
      .send({
        branchId: branchA,
        locationId: locationA,
        productId: concurrentProduct.body.id,
        direction: "OUT",
        quantity: "7",
        reason: "Concurrent two",
      }),
  ]);
  assert.deepEqual(
    reductions.map((response) => response.status).sort(),
    [201, 409],
  );
  assert.equal(
    (
      await prisma.inventoryBalance.findFirstOrThrow({
        where: { productId: concurrentProduct.body.id },
      })
    ).quantity.toString(),
    "3",
  );

  const secondBranchResponse = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/branches`)
    .set(bearer(ownerA))
    .send({ name: "Second Branch", code: `SECOND_${suffix.toUpperCase()}` });
  const secondBranch = secondBranchResponse.body.id as string;
  const secondLocation = (
    await prisma.stockLocation.findFirstOrThrow({
      where: { branchId: secondBranch, isDefault: true },
    })
  ).id;
  const transferResponse = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/inventory/transfers`)
    .set(bearer(ownerA))
    .set(idem())
    .send({
      fromBranchId: branchA,
      fromLocationId: locationA,
      toBranchId: secondBranch,
      toLocationId: secondLocation,
      items: [{ productId, quantity: "20", unitCostMinor: 150 }],
    });
  assert.equal(transferResponse.status, 201);
  assert.match(transferResponse.body.transferNumber, /^TRF-\d{4}-\d{6}$/);
  const transferId = transferResponse.body.id as string;
  const send = await request(app.getHttpServer())
    .post(
      `/api/v1/organizations/${orgA}/inventory/transfers/${transferId}/send`,
    )
    .set(bearer(ownerA))
    .set(idem());
  assert.equal(send.status, 201);
  const doubleSend = await request(app.getHttpServer())
    .post(
      `/api/v1/organizations/${orgA}/inventory/transfers/${transferId}/send`,
    )
    .set(bearer(ownerA));
  assert.equal(doubleSend.status, 409);
  assert.equal(
    await prisma.stockMovement.count({
      where: { referenceId: transferId, movementType: "TRANSFER_OUT" },
    }),
    1,
  );
  assert.equal(
    (
      await prisma.inventoryBalance.findFirstOrThrow({
        where: { locationId: locationA, productId },
      })
    ).quantity.toString(),
    "75",
  );
  assert.equal(
    await prisma.inventoryBalance.count({
      where: { locationId: secondLocation, productId },
    }),
    0,
  );
  const receive = await request(app.getHttpServer())
    .post(
      `/api/v1/organizations/${orgA}/inventory/transfers/${transferId}/receive`,
    )
    .set(bearer(ownerA))
    .set(idem());
  assert.equal(receive.status, 201);
  const doubleReceive = await request(app.getHttpServer())
    .post(
      `/api/v1/organizations/${orgA}/inventory/transfers/${transferId}/receive`,
    )
    .set(bearer(ownerA));
  assert.equal(doubleReceive.status, 409);
  assert.equal(
    await prisma.stockMovement.count({
      where: { referenceId: transferId, movementType: "TRANSFER_IN" },
    }),
    1,
  );
  assert.equal(
    (
      await prisma.inventoryBalance.findFirstOrThrow({
        where: { locationId: secondLocation, productId },
      })
    ).quantity.toString(),
    "20",
  );

  const movements = await request(app.getHttpServer())
    .get(
      `/api/v1/organizations/${orgA}/inventory/movements?productId=${productId}&pageSize=100`,
    )
    .set(bearer(auditorToken));
  assert.equal(movements.status, 200);
  assert.deepEqual(
    new Set(
      movements.body.items.map(
        (item: { movementType: string }) => item.movementType,
      ),
    ),
    new Set(["OPENING", "ADJUSTMENT_OUT", "TRANSFER_OUT", "TRANSFER_IN"]),
  );
  const reconciliation = await request(app.getHttpServer())
    .get(`/api/v1/organizations/${orgA}/inventory/reconciliation`)
    .set(bearer(auditorToken));
  assert.equal(reconciliation.status, 200);
  assert.equal(reconciliation.body.consistent, true);
  const branchReconciliation = await request(app.getHttpServer())
    .get(`/api/v1/organizations/${orgA}/inventory/reconciliation`)
    .set(bearer(managerToken));
  assert.equal(branchReconciliation.status, 200);
  assert.equal(
    branchReconciliation.body.entries.every(
      (entry: { key: string }) => !entry.key.endsWith(`:${secondLocation}`),
    ),
    true,
  );
  const branchProduct = await request(app.getHttpServer())
    .get(`/api/v1/organizations/${orgA}/products/${productId}`)
    .set(bearer(managerToken));
  assert.equal(
    branchProduct.body.inventoryBalances.every(
      (balance: { branchId: string }) => balance.branchId === branchA,
    ),
    true,
  );

  const cashierDenied = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/inventory/adjustments`)
    .set(bearer(cashierToken))
    .send({
      branchId: branchA,
      locationId: locationA,
      productId,
      direction: "OUT",
      quantity: "1",
      reason: "Forbidden",
    });
  assert.equal(cashierDenied.status, 403);
  assert.equal(
    (
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgA}/inventory/opening-stock`)
        .set(bearer(cashierToken))
        .send({
          branchId: branchA,
          locationId: locationA,
          productId,
          quantity: "1",
        })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgA}/inventory/transfers`)
        .set(bearer(cashierToken))
        .send({
          fromBranchId: branchA,
          fromLocationId: locationA,
          toBranchId: secondBranch,
          toLocationId: secondLocation,
          items: [{ productId, quantity: "1" }],
        })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app.getHttpServer())
        .post(
          `/api/v1/organizations/${orgA}/inventory/transfers/${transferId}/send`,
        )
        .set(bearer(cashierToken))
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app.getHttpServer())
        .post(
          `/api/v1/organizations/${orgA}/inventory/transfers/${transferId}/receive`,
        )
        .set(bearer(cashierToken))
    ).status,
    403,
  );
  const auditorDenied = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/products`)
    .set(bearer(auditorToken))
    .send({ name: "Forbidden product", unitId: unit.id, type: "STOCK_ITEM" });
  assert.equal(auditorDenied.status, 403);
  const foreignProductRead = await request(app.getHttpServer())
    .get(`/api/v1/organizations/${orgB}/products/${productId}`)
    .set(bearer(ownerB));
  assert.equal(foreignProductRead.status, 404);
  const foreignLocationAdjustment = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/inventory/adjustments`)
    .set(bearer(ownerA))
    .send({
      branchId: branchB,
      locationId: locationB,
      productId,
      direction: "IN",
      quantity: "1",
      reason: "Foreign branch",
    });
  assert.equal(foreignLocationAdjustment.status, 404);
  const immutableMovement = await request(app.getHttpServer())
    .patch(
      `/api/v1/organizations/${orgA}/inventory/movements/${opening.body.id}`,
    )
    .set(bearer(ownerA))
    .send({ quantity: 500 });
  assert.equal(immutableMovement.status, 404);

  const finalLedger = await prisma.stockMovement.aggregate({
    where: { organizationId: orgA, productId },
    _sum: { quantity: true },
  });
  const finalBalance = await prisma.inventoryBalance.aggregate({
    where: { organizationId: orgA, productId },
    _sum: { quantity: true },
  });
  assert.equal(
    (finalLedger._sum.quantity ?? new Prisma.Decimal(0)).toString(),
    "95",
  );
  assert.equal(
    (finalBalance._sum.quantity ?? new Prisma.Decimal(0)).toString(),
    "95",
  );

  console.log(
    "Phase 2 e2e passed: catalogue ownership, decimal ledger, concurrency, transfers, reconciliation, tenancy, and RBAC.",
  );
} finally {
  await prisma.stockTransfer.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  await prisma.stockMovement.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  await prisma.inventoryBalance.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: organizationIds } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: Object.values(emails) } },
  });
  await app.close();
}
