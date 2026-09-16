import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { prisma } from "@allshops/database";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { configureApi } from "../src/configure-api.js";

const module = await Test.createTestingModule({
  imports: [AppModule],
}).compile();
const app = module.createNestApplication();
configureApi(app);
await app.init();
const server = app.getHttpServer();
const suffix = randomUUID().slice(0, 8);
const password = "StrongPass123!";
const organizations: string[] = [];
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function register(email: string) {
  const response = await request(server).post("/api/v1/auth/register").send({
    email,
    name: "Phase 7 Owner",
    password,
  });
  assert.equal(response.status, 201);
  const activated = await request(server)
    .post("/api/v1/auth/activate-account")
    .send({ token: response.body.activationToken });
  assert.equal(activated.status, 201);
  return activated.body.accessToken as string;
}

try {
  const owner = await register(`phase7-${suffix}@example.com`);
  const organization = await request(server)
    .post("/api/v1/organizations")
    .set(bearer(owner))
    .send({ name: "Phase 7 Offline", businessType: "RETAIL" });
  assert.equal(organization.status, 201);
  const organizationId = organization.body.id as string;
  organizations.push(organizationId);
  const base = `/api/v1/organizations/${organizationId}`;
  const branch = await request(server)
    .post(`${base}/branches`)
    .set(bearer(owner))
    .send({ name: "Main", code: `O${suffix.toUpperCase()}` });
  assert.equal(branch.status, 201);
  const branchId = branch.body.id as string;
  const location = await prisma.stockLocation.findFirstOrThrow({
    where: { organizationId, branchId, isDefault: true },
  });
  const unit = await prisma.unit.findFirstOrThrow({
    where: { organizationId },
  });
  const priced = await request(server)
    .post(`${base}/products`)
    .set(bearer(owner))
    .send({
      name: "Cached price item",
      type: "NON_STOCK_ITEM",
      unitId: unit.id,
      priceMinor: 300,
      costMinor: 100,
      trackInventory: false,
    });
  const stocked = await request(server)
    .post(`${base}/products`)
    .set(bearer(owner))
    .send({
      name: "Final stock item",
      type: "STOCK_ITEM",
      unitId: unit.id,
      priceMinor: 100,
      costMinor: 50,
      trackInventory: true,
      allowNegativeStock: false,
    });
  assert.equal(priced.status, 201);
  assert.equal(stocked.status, 201);
  assert.equal(
    (
      await request(server)
        .post(`${base}/inventory/opening-stock`)
        .set(bearer(owner))
        .send({
          branchId,
          locationId: location.id,
          productId: stocked.body.id,
          quantity: "5",
          unitCostMinor: 50,
          reason: "Phase 7 conflict stock",
        })
    ).status,
    201,
  );

  async function device(name: string) {
    const result = await request(server)
      .post(`${base}/devices/register`)
      .set(bearer(owner))
      .send({ branchId, name, deviceIdentifier: randomUUID() });
    assert.equal(result.status, 201);
    return result.body.id as string;
  }
  const deviceA = await device("Offline Device A");
  const deviceB = await device("Offline Device B");
  const bootstrap = await request(server)
    .get(`${base}/sync/bootstrap?deviceId=${deviceA}`)
    .set(bearer(owner));
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.body.branch.id, branchId);
  const bootstrapB = await request(server)
    .get(`${base}/sync/bootstrap?deviceId=${deviceB}`)
    .set(bearer(owner));
  assert.equal(bootstrapB.status, 200);

  const cachedAt = new Date(bootstrap.body.cursor);
  assert.equal(
    (
      await request(server)
        .patch(`${base}/products/${priced.body.id}`)
        .set(bearer(owner))
        .send({ priceMinor: 400 })
    ).status,
    200,
  );
  const priceTransaction = randomUUID();
  const pricePayload = {
    payloadVersion: 1,
    transactionUuid: priceTransaction,
    deviceId: deviceA,
    branchId,
    localReference: "A-000001",
    sequenceNumber: 1,
    clientCreatedAt: new Date().toISOString(),
    catalogueSnapshotAt: cachedAt.toISOString(),
    offlineSessionIssuedAt: cachedAt.toISOString(),
    appVersion: "phase7-test",
    items: [
      {
        productId: priced.body.id,
        quantity: "1",
        priceSnapshotMinor: 300,
      },
    ],
    payments: [{ method: "CASH", amountMinor: 300, tenderedMinor: 300 }],
  };
  const firstSync = await request(server)
    .post(`${base}/sync/sales`)
    .set(bearer(owner))
    .send({ deviceId: deviceA, transactions: [pricePayload] });
  assert.equal(firstSync.status, 201);
  assert.equal(firstSync.body.results[0].status, "SYNCED");
  assert.equal(firstSync.body.results[0].pricePolicy, "LOCAL_PRICE_HONORED");
  const firstSaleId = firstSync.body.results[0].saleId as string;
  const paidSale = await prisma.sale.findUniqueOrThrow({
    where: { id: firstSaleId },
  });
  assert.equal(paidSale.totalMinor, 300);
  assert.equal(paidSale.source, "OFFLINE_SYNC");

  // Simulate a committed request whose response was lost: repeat exact payload.
  const replay = await request(server)
    .post(`${base}/sync/sales`)
    .set(bearer(owner))
    .send({ deviceId: deviceA, transactions: [pricePayload] });
  assert.equal(replay.status, 201);
  assert.equal(replay.body.results[0].saleId, firstSaleId);
  assert.equal(
    await prisma.sale.count({
      where: { organizationId, transactionUuid: priceTransaction },
    }),
    1,
  );
  assert.equal(
    await prisma.payment.count({ where: { saleId: firstSaleId } }),
    1,
  );

  const mismatched = structuredClone(pricePayload);
  mismatched.items[0]!.priceSnapshotMinor = 301;
  const mismatch = await request(server)
    .post(`${base}/sync/sales`)
    .set(bearer(owner))
    .send({ deviceId: deviceA, transactions: [mismatched] });
  assert.equal(mismatch.body.results[0].code, "IDEMPOTENCY_KEY_REUSE_MISMATCH");

  const stalePayload = {
    ...pricePayload,
    transactionUuid: randomUUID(),
    localReference: "A-000002",
    sequenceNumber: 2,
    catalogueSnapshotAt: new Date(Date.now() - 73 * 3_600_000).toISOString(),
  };
  const stale = await request(server)
    .post(`${base}/sync/sales`)
    .set(bearer(owner))
    .send({ deviceId: deviceA, transactions: [stalePayload] });
  assert.equal(stale.body.results[0].status, "CONFLICT");
  assert.equal(stale.body.results[0].code, "PRICE_STALE");

  const stockPayload = (
    deviceId: string,
    sequenceNumber: number,
    snapshotAt: string,
  ) => ({
    payloadVersion: 1,
    transactionUuid: randomUUID(),
    deviceId,
    branchId,
    localReference: `${deviceId.slice(0, 4)}-${sequenceNumber}`,
    sequenceNumber,
    clientCreatedAt: new Date().toISOString(),
    catalogueSnapshotAt: snapshotAt,
    offlineSessionIssuedAt: snapshotAt,
    appVersion: "phase7-test",
    items: [
      { productId: stocked.body.id, quantity: "4", priceSnapshotMinor: 100 },
    ],
    payments: [{ method: "CASH", amountMinor: 400 }],
  });
  const saleA = stockPayload(deviceA, 3, bootstrap.body.cursor);
  const saleB = stockPayload(deviceB, 1, bootstrapB.body.cursor);
  assert.equal(
    (
      await request(server)
        .post(`${base}/sync/sales`)
        .set(bearer(owner))
        .send({ deviceId: deviceA, transactions: [saleA] })
    ).body.results[0].status,
    "SYNCED",
  );
  const conflict = await request(server)
    .post(`${base}/sync/sales`)
    .set(bearer(owner))
    .send({ deviceId: deviceB, transactions: [saleB] });
  assert.equal(conflict.body.results[0].status, "CONFLICT");
  assert.equal(conflict.body.results[0].code, "INSUFFICIENT_STOCK");
  let balance = await prisma.inventoryBalance.findFirstOrThrow({
    where: { organizationId, branchId, productId: stocked.body.id },
  });
  assert.equal(balance.quantity.toString(), "1");
  assert.equal(
    await prisma.sale.count({
      where: { organizationId, transactionUuid: saleB.transactionUuid },
    }),
    0,
  );

  const resolved = await request(server)
    .post(`${base}/sync/conflicts/${saleB.transactionUuid}/resolve`)
    .set(bearer(owner))
    .send({ action: "ACCEPT_OVERRIDE" });
  assert.equal(resolved.status, 201);
  assert.equal(resolved.body.status, "SYNCED");
  balance = await prisma.inventoryBalance.findFirstOrThrow({
    where: { organizationId, branchId, productId: stocked.body.id },
  });
  assert.equal(balance.quantity.toString(), "-3");
  assert.equal(
    (await prisma.product.findUniqueOrThrow({ where: { id: stocked.body.id } }))
      .allowNegativeStock,
    false,
  );
  assert.equal(
    await prisma.sale.count({
      where: { organizationId, transactionUuid: saleB.transactionUuid },
    }),
    1,
  );

  console.log(
    "Phase 7 sync e2e passed: lost-response replay, payload hashing, cached/stale prices, two-device final-stock conflict, and one-time manager override.",
  );
} finally {
  await prisma.organization.deleteMany({
    where: { id: { in: organizations } },
  });
  await app.close();
  await prisma.$disconnect();
}
