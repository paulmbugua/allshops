import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { prisma } from "@allshops/database";
import { reportDateRangeSchema } from "@allshops/contracts";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { configureApi } from "../src/configure-api.js";
import { csv, neutralizeCsvFormula } from "../src/reports.service.js";

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
const key = () => randomUUID();

async function register(email: string) {
  const response = await request(server)
    .post("/api/v1/auth/register")
    .send({ email, name: "Phase 6 Owner", password });
  assert.equal(response.status, 201);
  return response.body.accessToken as string;
}

async function setup(token: string, name: string) {
  const organization = await request(server)
    .post("/api/v1/organizations")
    .set(bearer(token))
    .send({ name, businessType: "RETAIL" });
  assert.equal(organization.status, 201);
  organizations.push(organization.body.id);
  const first = await request(server)
    .post(`/api/v1/organizations/${organization.body.id}/branches`)
    .set(bearer(token))
    .send({
      name: "Main",
      code: `R6${randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`,
    });
  const second = await request(server)
    .post(`/api/v1/organizations/${organization.body.id}/branches`)
    .set(bearer(token))
    .send({
      name: "Second",
      code: `S6${randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`,
    });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  return {
    id: organization.body.id as string,
    main: first.body.id as string,
    second: second.body.id as string,
  };
}

try {
  // Pure CSV security covers all dangerous spreadsheet prefixes and Arabic UTF-8.
  for (const value of [
    "=1+1",
    "+cmd",
    "-10+20",
    "@SUM(A1:A2)",
    '  =HYPERLINK("x")',
  ])
    assert.ok(neutralizeCsvFormula(value).startsWith("'"));
  assert.ok(csv([{ name: "منتج", note: '=HYPERLINK("x")' }]).includes("منتج"));
  assert.equal(
    reportDateRangeSchema
      .parse({ dateFrom: "2026-09-08" })
      .dateFrom?.toISOString(),
    "2026-09-07T21:00:00.000Z",
  );

  const owner = await register(`phase6-${suffix}@example.com`);
  const org = await setup(owner, "Phase 6 Reports");
  const base = `/api/v1/organizations/${org.id}`;
  const unit = await prisma.unit.findFirstOrThrow({
    where: { organizationId: org.id },
  });
  const product = await request(server)
    .post(`${base}/products`)
    .set(bearer(owner))
    .send({
      name: "Historical cost item",
      type: "NON_STOCK_ITEM",
      unitId: unit.id,
      priceMinor: 10_000,
      costMinor: 6_000,
      trackInventory: false,
    });
  assert.equal(product.status, 201);
  const customer = await request(server)
    .post(`${base}/customers`)
    .set(bearer(owner))
    .send({
      name: '=HYPERLINK("https://invalid.example")',
      creditLimitMinor: 20_000,
    });
  assert.equal(customer.status, 201);

  const checkout = await request(server)
    .post(`${base}/sales/checkout`)
    .set(bearer(owner))
    .set("Idempotency-Key", key())
    .send({
      branchId: org.main,
      customerId: customer.body.id,
      items: [{ productId: product.body.id, quantity: "1" }],
      payments: [{ method: "CASH", amountMinor: 2_000 }],
    });
  assert.equal(checkout.status, 201);
  assert.equal(checkout.body.balanceMinor, 8_000);

  // Changing today's catalogue cost must never rewrite historical profit.
  assert.equal(
    (
      await request(server)
        .patch(`${base}/products/${product.body.id}`)
        .set(bearer(owner))
        .send({ costMinor: 9_000 })
    ).status,
    200,
  );
  const profit = await request(server)
    .get(`${base}/reports/profit`)
    .set(bearer(owner));
  assert.equal(profit.status, 200);
  assert.equal(profit.body.netRevenueMinor, 10_000);
  assert.equal(profit.body.historicalCostMinor, 6_000);
  assert.equal(profit.body.grossProfitMinor, 4_000);
  assert.equal(profit.body.costSource, "SALE_ITEM_SNAPSHOT");

  // Collected payment is the actual Payment amount: neither receivable nor tender.
  const payments = await request(server)
    .get(`${base}/reports/payments`)
    .set(bearer(owner));
  assert.equal(payments.status, 200);
  assert.equal(payments.body.collectedMinor, 2_000);
  assert.equal(payments.body.methods[0].amountMinor, 2_000);

  // A branch-bound manager has report permission but cannot select another branch.
  const roles = await request(server).get(`${base}/roles`).set(bearer(owner));
  const managerRoleId = roles.body.find(
    (role: { code: string }) => role.code === "MANAGER",
  ).id as string;
  const invitation = await request(server)
    .post(`${base}/users`)
    .set(bearer(owner))
    .send({
      name: "Branch Manager",
      email: `phase6-manager-${suffix}@example.com`,
      roleId: managerRoleId,
      branchId: org.main,
    });
  assert.equal(invitation.status, 201);
  const accepted = await request(server)
    .post("/api/v1/auth/accept-invite")
    .send({ token: invitation.body.invitationToken, password });
  assert.equal(accepted.status, 201);
  const manager = accepted.body.accessToken as string;
  assert.equal(
    (
      await request(server)
        .get(`${base}/reports/sales?branchId=${org.main}`)
        .set(bearer(manager))
    ).status,
    200,
  );
  const forbiddenBranch = await request(server)
    .get(`${base}/reports/sales?branchId=${org.second}`)
    .set(bearer(manager));
  assert.equal(forbiddenBranch.status, 403);
  assert.equal(forbiddenBranch.body.code, "BRANCH_FORBIDDEN");

  const viewOnlyRole = await prisma.role.create({
    data: {
      organizationId: org.id,
      name: "Sales report viewer",
      code: `REPORT_VIEWER_${suffix.toUpperCase()}`,
      permissions: {
        create: {
          permission: { connect: { code: "report.sales" } },
        },
      },
    },
  });
  const viewerInvitation = await request(server)
    .post(`${base}/users`)
    .set(bearer(owner))
    .send({
      name: "Report Viewer",
      email: `phase6-viewer-${suffix}@example.com`,
      roleId: viewOnlyRole.id,
      branchId: org.main,
    });
  assert.equal(viewerInvitation.status, 201);
  const viewerAccepted = await request(server)
    .post("/api/v1/auth/accept-invite")
    .send({ token: viewerInvitation.body.invitationToken, password });
  assert.equal(viewerAccepted.status, 201);
  const viewer = viewerAccepted.body.accessToken as string;
  assert.equal(
    (await request(server).get(`${base}/reports/sales`).set(bearer(viewer)))
      .status,
    200,
  );
  assert.equal(
    (
      await request(server)
        .get(`${base}/reports/sales/export?format=csv`)
        .set(bearer(viewer))
    ).status,
    403,
  );

  const customerCsv = await request(server)
    .get(`${base}/reports/customer-balances/export?format=csv`)
    .set(bearer(owner));
  assert.equal(customerCsv.status, 200);
  assert.match(customerCsv.headers["content-type"] ?? "", /text\/csv/);
  assert.ok(customerCsv.text.includes(`'=HYPERLINK`));
  const audit = await prisma.auditLog.findFirst({
    where: {
      organizationId: org.id,
      action: "REPORT_EXPORTED",
      entityId: "customer-balances",
    },
  });
  assert.ok(audit);

  const foreignOwner = await register(`phase6-foreign-${suffix}@example.com`);
  const foreign = await setup(foreignOwner, "Foreign Reports");
  assert.equal(
    (
      await request(server)
        .get(`${base}/reports/sales`)
        .set(bearer(foreignOwner))
    ).status,
    403,
  );
  assert.equal(
    (
      await request(server)
        .get(`/api/v1/organizations/${foreign.id}/reports/sales`)
        .set(bearer(owner))
    ).status,
    403,
  );

  console.log(
    "Phase 6 e2e passed: historical profit, collected credit handling, tenant/branch scope, export RBAC/audit, UTF-8 and CSV injection protection.",
  );
} finally {
  await prisma.organization.deleteMany({
    where: { id: { in: organizations } },
  });
  await app.close();
  await prisma.$disconnect();
}
