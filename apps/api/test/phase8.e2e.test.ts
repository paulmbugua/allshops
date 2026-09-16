import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { prisma } from "@allshops/database";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { configureApi } from "../src/configure-api.js";
import { EntitlementService } from "../src/entitlement.service.js";

const module = await Test.createTestingModule({
  imports: [AppModule],
}).compile();
const app = module.createNestApplication();
configureApi(app);
await app.init();
const server = app.getHttpServer();
const suffix = randomUUID().slice(0, 8);
const email = `phase8-${suffix}@example.com`;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
let organizationId = "";

try {
  const registered = await request(server).post("/api/v1/auth/register").send({
    email,
    name: "Phase 8 Owner",
    password: "StrongPass123!",
  });
  assert.equal(registered.status, 201);
  const accountActivation = await request(server)
    .post("/api/v1/auth/activate-account")
    .send({ token: registered.body.activationToken });
  assert.equal(accountActivation.status, 201);
  const token = accountActivation.body.accessToken as string;
  const userId = registered.body.user.id as string;
  const created = await request(server)
    .post("/api/v1/organizations")
    .set(bearer(token))
    .send({ name: "Phase 8 Merchant", businessType: "RETAIL" });
  assert.equal(created.status, 201);
  organizationId = created.body.id;
  const base = `/api/v1/organizations/${organizationId}`;
  const trial = await prisma.subscription.findUniqueOrThrow({
    where: { organizationId },
    include: { plan: true },
  });
  assert.equal(trial.status, "TRIALING");
  assert.equal(trial.plan.code, "GROWTH");
  assert.ok(trial.trialEndsAt && trial.trialStartedAt);

  const quotaPlan = await prisma.plan.create({
    data: {
      code: `TEST_${suffix}`,
      name: "Concurrency quota",
      monthlyPriceMinor: 1,
      annualPriceMinor: 1,
      isPublic: false,
      features: {
        create: [
          "pos",
          "inventory",
          "customers",
          "reports",
          "offline_pos",
          "multi_branch",
        ].map((featureCode) => ({ featureCode })),
      },
      limits: {
        create: [
          ["branches.max", 1],
          ["users.max", 2],
          ["devices.max", 1],
          ["products.max", 1],
        ].map(([limitCode, value]) => ({
          limitCode: String(limitCode),
          value: Number(value),
        })),
      },
    },
  });
  await prisma.subscription.update({
    where: { organizationId },
    data: { planId: quotaPlan.id },
  });

  const branchResults = await Promise.all([
    request(server)
      .post(`${base}/branches`)
      .set(bearer(token))
      .send({ name: "One", code: `A${suffix.toUpperCase()}` }),
    request(server)
      .post(`${base}/branches`)
      .set(bearer(token))
      .send({ name: "Two", code: `B${suffix.toUpperCase()}` }),
  ]);
  assert.deepEqual(
    branchResults.map((row) => row.status).sort(),
    [201, 409],
    JSON.stringify(branchResults.map((row) => row.body)),
  );
  assert.equal(
    await prisma.branch.count({ where: { organizationId, isActive: true } }),
    1,
  );
  const branch = await prisma.branch.findFirstOrThrow({
    where: { organizationId, isActive: true },
  });
  const unit = await prisma.unit.findFirstOrThrow({
    where: { organizationId },
  });

  const productBody = (name: string) => ({
    name,
    type: "NON_STOCK_ITEM",
    unitId: unit.id,
    priceMinor: 500,
    costMinor: 100,
    trackInventory: false,
  });
  const productResults = await Promise.all([
    request(server)
      .post(`${base}/products`)
      .set(bearer(token))
      .send(productBody("Product A")),
    request(server)
      .post(`${base}/products`)
      .set(bearer(token))
      .send(productBody("Product B")),
  ]);
  assert.deepEqual(
    productResults.map((row) => row.status).sort(),
    [201, 409],
    JSON.stringify(productResults.map((row) => row.body)),
  );
  assert.equal(
    await prisma.product.count({ where: { organizationId, isActive: true } }),
    1,
  );
  const product = await prisma.product.findFirstOrThrow({
    where: { organizationId },
  });

  const deviceResults = await Promise.all([
    request(server).post(`${base}/devices/register`).set(bearer(token)).send({
      branchId: branch.id,
      name: "Register A",
      deviceIdentifier: randomUUID(),
    }),
    request(server).post(`${base}/devices/register`).set(bearer(token)).send({
      branchId: branch.id,
      name: "Register B",
      deviceIdentifier: randomUUID(),
    }),
  ]);
  assert.deepEqual(
    deviceResults.map((row) => row.status).sort(),
    [201, 409],
    JSON.stringify(deviceResults.map((row) => row.body)),
  );
  assert.equal(
    await prisma.device.count({ where: { organizationId, status: "ACTIVE" } }),
    1,
  );
  const deviceId = deviceResults.find((row) => row.status === 201)!.body
    .id as string;

  const roles = await request(server).get(`${base}/roles`).set(bearer(token));
  const cashierRole = roles.body.find(
    (role: { code: string }) => role.code === "CASHIER",
  );
  const inviteResults = await Promise.all([
    request(server)
      .post(`${base}/users`)
      .set(bearer(token))
      .send({
        name: "Cashier A",
        email: `phase8-a-${suffix}@example.com`,
        roleId: cashierRole.id,
        branchId: branch.id,
      }),
    request(server)
      .post(`${base}/users`)
      .set(bearer(token))
      .send({
        name: "Cashier B",
        email: `phase8-b-${suffix}@example.com`,
        roleId: cashierRole.id,
        branchId: branch.id,
      }),
  ]);
  assert.deepEqual(
    inviteResults.map((row) => row.status).sort(),
    [201, 409],
    JSON.stringify(inviteResults.map((row) => row.body)),
  );
  assert.equal(
    await prisma.organizationUser.count({
      where: { organizationId, status: { in: ["ACTIVE", "INVITED"] } },
    }),
    2,
  );

  const starter = await prisma.plan.findUniqueOrThrow({
    where: { code: "STARTER" },
  });
  await prisma.subscription.update({
    where: { organizationId },
    data: { planId: starter.id },
  });
  const appointmentBlocked = await request(server)
    .get(`${base}/appointments?page=1&pageSize=10`)
    .set(bearer(token));
  assert.equal(appointmentBlocked.status, 403);
  assert.equal(appointmentBlocked.body.code, "FEATURE_NOT_INCLUDED");

  const tampered = await request(server)
    .post(`${base}/subscription/select-plan`)
    .set(bearer(token))
    .send({ planCode: "BUSINESS", billingInterval: "MONTHLY", amountMinor: 1 });
  assert.equal(tampered.status, 400);
  const selection = await request(server)
    .post(`${base}/subscription/select-plan`)
    .set(bearer(token))
    .send({ planCode: "BUSINESS", billingInterval: "MONTHLY" });
  assert.equal(selection.status, 201);
  assert.equal(selection.body.billingRecord.amountMinor, 19900);
  const billId = selection.body.billingRecord.id as string;
  const subscriptionId = trial.id;
  const paymentCountBefore = await prisma.payment.count({
    where: { organizationId },
  });
  const saleCountBefore = await prisma.sale.count({
    where: { organizationId },
  });
  const merchantAttack = await request(server)
    .post(`/api/v1/platform/subscriptions/${subscriptionId}/confirm-payment`)
    .set(bearer(token))
    .set("Idempotency-Key", randomUUID())
    .send({
      billingRecordId: billId,
      paymentMethod: "BANK_TRANSFER",
      paymentReference: "BANK-ATTACK",
    });
  assert.equal(merchantAttack.status, 403);

  await prisma.user.update({
    where: { id: userId },
    data: { isPlatformAdmin: true },
  });
  const confirmationKey = randomUUID();
  const confirmationBody = {
    billingRecordId: billId,
    paymentMethod: "BANK_TRANSFER",
    paymentReference: "BANK-001",
  };
  const paid = await request(server)
    .post(`/api/v1/platform/subscriptions/${subscriptionId}/confirm-payment`)
    .set(bearer(token))
    .set("Idempotency-Key", confirmationKey)
    .send(confirmationBody);
  assert.equal(paid.status, 201);
  const activated = await prisma.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
  });
  const repeated = await request(server)
    .post(`/api/v1/platform/subscriptions/${subscriptionId}/confirm-payment`)
    .set(bearer(token))
    .set("Idempotency-Key", confirmationKey)
    .send(confirmationBody);
  assert.equal(repeated.status, 201);
  const afterRepeat = await prisma.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
  });
  assert.equal(
    afterRepeat.currentPeriodEnd?.toISOString(),
    activated.currentPeriodEnd?.toISOString(),
  );
  assert.equal(
    await prisma.payment.count({ where: { organizationId } }),
    paymentCountBefore,
  );
  assert.equal(
    await prisma.sale.count({ where: { organizationId } }),
    saleCountBefore,
  );

  const bootstrap = await request(server)
    .get(`${base}/sync/bootstrap?deviceId=${deviceId}`)
    .set(bearer(token));
  assert.equal(bootstrap.status, 200);
  const suspended = await request(server)
    .post(`/api/v1/platform/subscriptions/${subscriptionId}/suspend`)
    .set(bearer(token))
    .send({ reason: "Phase 8 suspension test" });
  assert.equal(suspended.status, 201);
  const blockedSale = await request(server)
    .post(`${base}/sales/checkout`)
    .set(bearer(token))
    .set("Idempotency-Key", randomUUID())
    .send({
      branchId: branch.id,
      items: [{ productId: product.id, quantity: "1" }],
      payments: [{ method: "CASH", amountMinor: 500 }],
    });
  assert.equal(blockedSale.status, 403);
  assert.equal(blockedSale.body.code, "SUBSCRIPTION_SUSPENDED");
  assert.equal(
    (await request(server).get(`${base}/billing`).set(bearer(token))).status,
    200,
  );
  assert.equal(
    (
      await request(server)
        .get(`${base}/sales?page=1&pageSize=10`)
        .set(bearer(token))
    ).status,
    200,
  );

  const snapshot = bootstrap.body.entitlement;
  const offlinePayload = {
    payloadVersion: 1,
    transactionUuid: randomUUID(),
    deviceId,
    branchId: branch.id,
    localReference: "P8-OFF-1",
    sequenceNumber: 1,
    clientCreatedAt: snapshot.snapshotAt,
    catalogueSnapshotAt: bootstrap.body.cursor,
    offlineSessionIssuedAt: snapshot.snapshotAt,
    appVersion: "phase8-test",
    items: [{ productId: product.id, quantity: "1", priceSnapshotMinor: 500 }],
    payments: [{ method: "CASH", amountMinor: 500 }],
  };
  const validPrior = await request(server)
    .post(`${base}/sync/sales`)
    .set(bearer(token))
    .send({ deviceId, transactions: [offlinePayload] });
  assert.equal(validPrior.body.results[0].status, "SYNCED");
  await prisma.device.update({
    where: { id: deviceId },
    data: { entitlementExpiresAt: new Date(Date.now() - 1_000) },
  });
  const expiredOffline = {
    ...offlinePayload,
    transactionUuid: randomUUID(),
    localReference: "P8-OFF-2",
    sequenceNumber: 2,
    clientCreatedAt: new Date().toISOString(),
  };
  const expiredResult = await request(server)
    .post(`${base}/sync/sales`)
    .set(bearer(token))
    .send({ deviceId, transactions: [expiredOffline] });
  assert.equal(
    expiredResult.body.results[0].code,
    "OFFLINE_ENTITLEMENT_EXPIRED",
  );

  const lifecycle = app.get(EntitlementService);
  const lifecycleNow = new Date();
  const suspensionEventsBefore = await prisma.subscriptionEvent.count({
    where: { subscriptionId, eventType: "SUBSCRIPTION_SUSPENDED" },
  });
  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      status: "ACTIVE",
      cancelAtPeriodEnd: false,
      currentPeriodStart: new Date(lifecycleNow.getTime() - 86_400_000),
      currentPeriodEnd: new Date(lifecycleNow.getTime() - 1_000),
      graceEndsAt: null,
      suspendedAt: null,
    },
  });
  await lifecycle.normalize(organizationId, lifecycleNow);
  assert.equal(
    (
      await prisma.subscription.findUniqueOrThrow({
        where: { id: subscriptionId },
      })
    ).status,
    "PAST_DUE",
  );
  await lifecycle.normalize(organizationId, lifecycleNow);
  assert.equal(
    (
      await prisma.subscription.findUniqueOrThrow({
        where: { id: subscriptionId },
      })
    ).status,
    "GRACE_PERIOD",
  );
  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { graceEndsAt: new Date(lifecycleNow.getTime() - 1_000) },
  });
  await lifecycle.normalize(organizationId, lifecycleNow);
  await lifecycle.normalize(organizationId, lifecycleNow);
  assert.equal(
    (
      await prisma.subscription.findUniqueOrThrow({
        where: { id: subscriptionId },
      })
    ).status,
    "SUSPENDED",
  );
  const lifecycleEvents = await prisma.subscriptionEvent.groupBy({
    by: ["eventType"],
    where: {
      subscriptionId,
      eventType: {
        in: ["SUBSCRIPTION_PAST_DUE", "SUBSCRIPTION_GRACE_STARTED"],
      },
    },
    _count: true,
  });
  for (const event of lifecycleEvents) assert.equal(event._count, 1);
  assert.equal(lifecycleEvents.length, 2);
  assert.equal(
    await prisma.subscriptionEvent.count({
      where: { subscriptionId, eventType: "SUBSCRIPTION_SUSPENDED" },
    }),
    suspensionEventsBefore + 1,
  );

  assert.equal(
    await prisma.organization.count({ where: { id: organizationId } }),
    1,
  );
  console.log(
    "Phase 8 e2e passed: four advisory-lock quotas, feature gates, price/platform security, billing idempotency, suspension preservation, financial separation, and bounded offline entitlement.",
  );
} finally {
  if (organizationId)
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.plan.deleteMany({ where: { code: `TEST_${suffix}` } });
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          email,
          `phase8-a-${suffix}@example.com`,
          `phase8-b-${suffix}@example.com`,
        ],
      },
    },
  });
  await app.close();
}
