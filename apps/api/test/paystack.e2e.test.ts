import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { prisma } from "@allshops/database";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { configureApi } from "../src/configure-api.js";

process.env.PAYSTACK_SECRET_KEY = "sk_test_allshops_test_only";
process.env.PAYSTACK_CURRENCY = "QAR";
process.env.PAYSTACK_SUBSCRIPTION_CALLBACK_URL =
  "http://localhost:3000/settings/subscription/payment-return";

const module = await Test.createTestingModule({
  imports: [AppModule],
}).compile();
const app = module.createNestApplication();
configureApi(app);
await app.init();
const server = app.getHttpServer();
const originalFetch = globalThis.fetch;
const suffix = randomUUID().slice(0, 8);
const email = `paystack-${suffix}@example.com`;
let organizationId = "";
let initializedBody: Record<string, unknown> | undefined;

try {
  const registered = await request(server).post("/api/v1/auth/register").send({
    email,
    name: "Paystack Cashier",
    password: "StrongPass123!",
  });
  const activated = await request(server)
    .post("/api/v1/auth/activate-account")
    .send({ token: registered.body.activationToken });
  assert.equal(activated.status, 201);
  const token = activated.body.accessToken as string;
  const auth = { Authorization: `Bearer ${token}` };
  const organization = await request(server)
    .post("/api/v1/organizations")
    .set(auth)
    .send({ name: "Paystack Shop", businessType: "RETAIL" });
  organizationId = organization.body.id;
  await request(server)
    .post(`/api/v1/organizations/${organizationId}/branches`)
    .set(auth)
    .send({ name: "Main", code: `PS${suffix.toUpperCase()}` });
  const merchantGatewayRoute = await request(server)
    .post(
      `/api/v1/organizations/${organizationId}/payments/paystack/initialize`,
    )
    .set(auth)
    .set("Idempotency-Key", randomUUID())
    .send({});
  assert.equal(merchantGatewayRoute.status, 404);

  const plans = await request(server).get("/api/v1/plans");
  const paidPlan = plans.body.find(
    (plan: { code: string; monthlyPriceMinor: number }) =>
      plan.code !== "ENTERPRISE" && plan.monthlyPriceMinor > 0,
  );
  const selected = await request(server)
    .post(`/api/v1/organizations/${organizationId}/subscription/select-plan`)
    .set(auth)
    .send({ planCode: paidPlan.code, billingInterval: "MONTHLY" });
  const bill = selected.body.billingRecord;
  process.env.PAYSTACK_CURRENCY = "KES";
  process.env.PAYSTACK_QAR_TO_KES_RATE = "30";
  const gatewayAmountMinor = bill.amountMinor * 30;
  globalThis.fetch = (async (_input, init) => {
    initializedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        status: true,
        message: "Authorization URL created",
        data: {
          authorization_url: "https://checkout.paystack.com/subscription",
          access_code: "subscription",
          reference: initializedBody.reference,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  const subscriptionIntent = await request(server)
    .post(
      `/api/v1/organizations/${organizationId}/payments/paystack/subscriptions/${bill.id}/initialize`,
    )
    .set(auth)
    .set("Idempotency-Key", randomUUID());
  assert.equal(subscriptionIntent.status, 201);
  assert.equal(initializedBody?.amount, String(gatewayAmountMinor));
  assert.equal(initializedBody?.currency, "KES");
  assert.equal(subscriptionIntent.body.sourceAmountMinor, bill.amountMinor);
  assert.equal(subscriptionIntent.body.sourceCurrency, "QAR");
  assert.deepEqual(initializedBody?.channels, ["card"]);
  assert.equal(
    JSON.parse(String(initializedBody?.metadata)).purpose,
    "allshops_subscription",
  );
  const subscriptionReference = subscriptionIntent.body.reference as string;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        status: true,
        message: "Verification successful",
        data: {
          id: 789012,
          status: "success",
          reference: subscriptionReference,
          amount: gatewayAmountMinor,
          currency: "KES",
          channel: "card",
          paid_at: new Date().toISOString(),
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;
  const subscriptionVerified = await request(server)
    .post(
      `/api/v1/organizations/${organizationId}/payments/paystack/subscriptions/${subscriptionReference}/verify`,
    )
    .set(auth);
  assert.equal(subscriptionVerified.status, 201);
  assert.equal(subscriptionVerified.body.status, "COMPLETED");
  assert.equal(subscriptionVerified.body.billingRecord.status, "PAID");
  const repeatedVerification = await request(server)
    .post(
      `/api/v1/organizations/${organizationId}/payments/paystack/subscriptions/${subscriptionReference}/verify`,
    )
    .set(auth);
  assert.equal(repeatedVerification.status, 201);
  assert.equal(
    repeatedVerification.body.billingRecord.id,
    subscriptionVerified.body.billingRecord.id,
  );
  assert.equal(await prisma.sale.count({ where: { organizationId } }), 0);
  assert.equal(await prisma.payment.count({ where: { organizationId } }), 0);
  console.log(
    "Paystack e2e passed: merchant gateway routes absent, subscription card-only verification, activation, and POS-ledger separation.",
  );
} finally {
  globalThis.fetch = originalFetch;
  if (organizationId)
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.user.deleteMany({ where: { email } });
  await app.close();
}
