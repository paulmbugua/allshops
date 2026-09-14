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
  const response = await request(server)
    .post("/api/v1/auth/register")
    .send({ email, name: "Phase 5 Owner", password });
  assert.equal(response.status, 201);
  return response.body.accessToken as string;
}
async function setup(token: string, name: string) {
  const org = await request(server)
    .post("/api/v1/organizations")
    .set(bearer(token))
    .send({ name, businessType: "RETAIL" });
  assert.equal(org.status, 201);
  organizations.push(org.body.id);
  const branch = await request(server)
    .post(`/api/v1/organizations/${org.body.id}/branches`)
    .set(bearer(token))
    .send({
      name: "Main",
      code: `P5${randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`,
    });
  assert.equal(branch.status, 201);
  return { id: org.body.id as string, branchId: branch.body.id as string };
}

try {
  const owner = await register(`phase5-${suffix}@example.com`);
  const org = await setup(owner, "Phase 5 Salon");
  const base = `/api/v1/organizations/${org.id}`;
  const unit = await prisma.unit.findFirstOrThrow({
    where: { organizationId: org.id },
  });
  const roles = await request(server).get(`${base}/roles`).set(bearer(owner));
  const serviceStaffRoleId = roles.body.find(
    (row: { code: string }) => row.code === "SERVICE_STAFF",
  ).id as string;
  const staffEmail = `phase5-staff-${suffix}@example.com`;
  const invitation = await request(server)
    .post(`${base}/users`)
    .set(bearer(owner))
    .send({
      name: "Amina",
      email: staffEmail,
      roleId: serviceStaffRoleId,
      branchId: org.branchId,
    });
  assert.equal(invitation.status, 201);
  const accepted = await request(server)
    .post("/api/v1/auth/accept-invite")
    .send({ token: invitation.body.invitationToken, password });
  assert.equal(accepted.status, 201);
  const staffToken = accepted.body.accessToken as string;
  const staffUser = await prisma.user.findUniqueOrThrow({
    where: { email: staffEmail },
  });
  const product = await request(server)
    .post(`${base}/products`)
    .set(bearer(owner))
    .send({
      name: "Hair treatment",
      type: "SERVICE",
      unitId: unit.id,
      priceMinor: 10_000,
      costMinor: 0,
      trackInventory: false,
    });
  assert.equal(product.status, 201);
  assert.equal(
    (
      await request(server)
        .put(`${base}/products/${product.body.id}/service-profile`)
        .set(bearer(owner))
        .send({
          durationMinutes: 30,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
        })
    ).status,
    200,
  );
  const staff = await request(server)
    .post(`${base}/staff`)
    .set(bearer(owner))
    .send({ userId: staffUser.id, displayName: "Amina", jobTitle: "Stylist" });
  assert.equal(staff.status, 201);
  assert.equal(
    (
      await request(server)
        .post(`${base}/staff/${staff.body.id}/branches`)
        .set(bearer(owner))
        .send({ branchId: org.branchId, isPrimary: true })
    ).status,
    201,
  );
  assert.equal(
    (
      await request(server)
        .post(`${base}/staff/${staff.body.id}/services`)
        .set(bearer(owner))
        .send({ serviceProductId: product.body.id })
    ).status,
    201,
  );
  assert.equal(
    (
      await request(server)
        .put(`${base}/staff/${staff.body.id}/availability`)
        .set(bearer(owner))
        .send({
          ranges: [
            {
              branchId: org.branchId,
              dayOfWeek: 1,
              startTime: "09:00",
              endTime: "18:00",
            },
          ],
        })
    ).status,
    200,
  );
  const outsideHours = await request(server)
    .post(`${base}/appointments`)
    .set(bearer(owner))
    .send({
      branchId: org.branchId,
      customerName: "Late",
      primaryStaffProfileId: staff.body.id,
      startAt: "2027-01-04T17:00:00.000Z",
      services: [
        { serviceProductId: product.body.id, staffProfileId: staff.body.id },
      ],
    });
  assert.equal(outsideHours.status, 409);
  assert.equal(
    (
      await request(server)
        .post(`${base}/staff/${staff.body.id}/time-off`)
        .set(bearer(owner))
        .send({
          startAt: "2027-01-04T11:00:00.000Z",
          endAt: "2027-01-04T13:00:00.000Z",
          reason: "Training",
        })
    ).status,
    201,
  );
  const timeOffBooking = await request(server)
    .post(`${base}/appointments`)
    .set(bearer(owner))
    .send({
      branchId: org.branchId,
      customerName: "Time off",
      primaryStaffProfileId: staff.body.id,
      startAt: "2027-01-04T12:00:00.000Z",
      services: [
        { serviceProductId: product.body.id, staffProfileId: staff.body.id },
      ],
    });
  assert.equal(timeOffBooking.status, 409);
  const secondService = await request(server)
    .post(`${base}/products`)
    .set(bearer(owner))
    .send({
      name: "Unassigned service",
      type: "SERVICE",
      unitId: unit.id,
      priceMinor: 3000,
      costMinor: 0,
      trackInventory: false,
    });
  await request(server)
    .put(`${base}/products/${secondService.body.id}/service-profile`)
    .set(bearer(owner))
    .send({ durationMinutes: 30 });
  const incapable = await request(server)
    .post(`${base}/appointments`)
    .set(bearer(owner))
    .send({
      branchId: org.branchId,
      customerName: "Wrong service",
      primaryStaffProfileId: staff.body.id,
      startAt: "2027-01-04T06:00:00.000Z",
      services: [
        {
          serviceProductId: secondService.body.id,
          staffProfileId: staff.body.id,
        },
      ],
    });
  assert.equal(incapable.status, 404);
  const customer = await request(server)
    .post(`${base}/customers`)
    .set(bearer(owner))
    .send({ name: "Maya", phone: "+97455550001" });
  assert.equal(customer.status, 201);

  const foreignOwner = await register(`phase5-foreign-${suffix}@example.com`);
  const foreign = await setup(foreignOwner, "Foreign Salon");
  const foreignUser = await prisma.user.findUniqueOrThrow({
    where: { email: `phase5-foreign-${suffix}@example.com` },
  });
  assert.equal(
    (
      await request(server)
        .post(`${base}/staff`)
        .set(bearer(owner))
        .send({ userId: foreignUser.id, displayName: "Foreign linked user" })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(server)
        .post(`${base}/staff/${staff.body.id}/branches`)
        .set(bearer(owner))
        .send({ branchId: foreign.branchId })
    ).status,
    404,
  );
  const foreignUnit = await prisma.unit.findFirstOrThrow({
    where: { organizationId: foreign.id },
  });
  const foreignService = await request(server)
    .post(`/api/v1/organizations/${foreign.id}/products`)
    .set(bearer(foreignOwner))
    .send({
      name: "Foreign service",
      type: "SERVICE",
      unitId: foreignUnit.id,
      priceMinor: 1000,
      costMinor: 0,
      trackInventory: false,
    });
  const foreignServiceAttack = await request(server)
    .post(`${base}/appointments`)
    .set(bearer(owner))
    .send({
      branchId: org.branchId,
      customerName: "Attack",
      primaryStaffProfileId: staff.body.id,
      startAt: "2027-01-04T06:00:00.000Z",
      services: [
        {
          serviceProductId: foreignService.body.id,
          staffProfileId: staff.body.id,
        },
      ],
    });
  assert.equal(foreignServiceAttack.status, 404);
  const foreignStaff = await request(server)
    .post(`/api/v1/organizations/${foreign.id}/staff`)
    .set(bearer(foreignOwner))
    .send({ displayName: "Foreign staff" });
  const foreignStaffAttack = await request(server)
    .post(`${base}/appointments`)
    .set(bearer(owner))
    .send({
      branchId: org.branchId,
      customerName: "Attack",
      primaryStaffProfileId: foreignStaff.body.id,
      startAt: "2027-01-04T06:00:00.000Z",
      services: [
        {
          serviceProductId: product.body.id,
          staffProfileId: foreignStaff.body.id,
        },
      ],
    });
  assert.equal(foreignStaffAttack.status, 404);
  const foreignCustomer = await request(server)
    .post(`/api/v1/organizations/${foreign.id}/customers`)
    .set(bearer(foreignOwner))
    .send({ name: "Foreign customer" });
  const foreignCustomerAttack = await request(server)
    .post(`${base}/appointments`)
    .set(bearer(owner))
    .send({
      branchId: org.branchId,
      customerId: foreignCustomer.body.id,
      primaryStaffProfileId: staff.body.id,
      startAt: "2027-01-04T06:00:00.000Z",
      services: [
        { serviceProductId: product.body.id, staffProfileId: staff.body.id },
      ],
    });
  assert.equal(foreignCustomerAttack.status, 404);

  const payload = {
    branchId: org.branchId,
    customerId: customer.body.id,
    primaryStaffProfileId: staff.body.id,
    startAt: "2027-01-04T07:00:00.000Z",
    services: [
      { serviceProductId: product.body.id, staffProfileId: staff.body.id },
    ],
  };
  const booked = await request(server)
    .post(`${base}/appointments`)
    .set(bearer(owner))
    .send(payload);
  assert.equal(booked.status, 201);
  assert.equal(booked.body.status, "BOOKED");
  assert.equal(booked.body.services[0].priceMinorSnapshot, 10_000);
  const overlap = await request(server)
    .post(`${base}/appointments`)
    .set(bearer(owner))
    .send({ ...payload, customerName: "Overlap" });
  assert.equal(overlap.status, 409);
  assert.equal(overlap.body.code, "APPOINTMENT_OVERLAP");
  const cancellable = await request(server)
    .post(`${base}/appointments`)
    .set(bearer(owner))
    .send({
      ...payload,
      customerName: "Cancel",
      startAt: "2027-01-04T13:00:00.000Z",
    });
  assert.equal(cancellable.status, 201);
  assert.equal(
    (
      await request(server)
        .post(`${base}/appointments/${cancellable.body.id}/cancel`)
        .set(bearer(owner))
        .send({ cancellationReason: "Changed plans" })
    ).body.status,
    "CANCELLED",
  );
  assert.equal(
    (
      await request(server)
        .post(`${base}/appointments/${cancellable.body.id}/start`)
        .set(bearer(owner))
    ).status,
    409,
  );
  const noShow = await request(server)
    .post(`${base}/appointments`)
    .set(bearer(owner))
    .send({
      ...payload,
      customerName: "No show",
      startAt: "2027-01-04T13:00:00.000Z",
    });
  assert.equal(noShow.status, 201);
  assert.equal(
    (
      await request(server)
        .post(`${base}/appointments/${noShow.body.id}/no-show`)
        .set(bearer(owner))
    ).body.status,
    "NO_SHOW",
  );
  const concurrentPayload = {
    ...payload,
    customerName: "Concurrent",
    startAt: "2027-01-04T08:00:00.000Z",
  };
  const concurrent = await Promise.all([
    request(server)
      .post(`${base}/appointments`)
      .set(bearer(owner))
      .send(concurrentPayload),
    request(server)
      .post(`${base}/appointments`)
      .set(bearer(owner))
      .send(concurrentPayload),
  ]);
  assert.deepEqual(concurrent.map((row) => row.status).sort(), [201, 409]);
  assert.equal(
    (
      await request(server)
        .post(`${base}/appointments/${booked.body.id}/confirm`)
        .set(bearer(owner))
    ).body.status,
    "CONFIRMED",
  );
  assert.equal(
    (
      await request(server)
        .post(`${base}/appointments/${booked.body.id}/start`)
        .set(bearer(owner))
    ).body.status,
    "IN_PROGRESS",
  );
  assert.equal(
    (
      await request(server)
        .post(`${base}/appointments/${booked.body.id}/complete`)
        .set(bearer(owner))
    ).body.status,
    "COMPLETED",
  );
  assert.equal(
    (
      await request(server)
        .post(`${base}/appointments/${booked.body.id}/cancel`)
        .set(bearer(owner))
        .send({})
    ).status,
    409,
  );

  const rule = await request(server)
    .post(`${base}/commission-rules`)
    .set(bearer(owner))
    .send({
      staffProfileId: staff.body.id,
      serviceProductId: product.body.id,
      type: "PERCENTAGE",
      basisPoints: 1000,
    });
  assert.equal(rule.status, 201);
  const defaultRule = await request(server)
    .post(`${base}/commission-rules`)
    .set(bearer(owner))
    .send({ staffProfileId: staff.body.id, type: "FIXED", valueMinor: 700 });
  assert.equal(defaultRule.status, 201);
  const missingStaff = await request(server)
    .post(`${base}/sales/checkout`)
    .set(bearer(owner))
    .set("Idempotency-Key", randomUUID())
    .send({
      branchId: org.branchId,
      items: [{ productId: product.body.id, quantity: "1" }],
      payments: [{ method: "CASH", amountMinor: 10_000 }],
    });
  assert.equal(missingStaff.status, 400);
  assert.equal(missingStaff.body.code, "SERVICE_STAFF_REQUIRED");
  const precedenceSale = await request(server)
    .post(`${base}/sales/checkout`)
    .set(bearer(owner))
    .set("Idempotency-Key", randomUUID())
    .send({
      branchId: org.branchId,
      items: [
        {
          productId: product.body.id,
          staffProfileId: staff.body.id,
          quantity: "1",
        },
      ],
      payments: [{ method: "CASH", amountMinor: 10_000 }],
    });
  assert.equal(precedenceSale.status, 201);
  assert.equal(
    (
      await prisma.commission.findFirstOrThrow({
        where: { saleId: precedenceSale.body.id },
      })
    ).commissionAmountMinor,
    1000,
  );
  const checkoutKey = randomUUID();
  const checkoutPayload = {
    discount: { type: "PERCENTAGE", basisPoints: 1000 },
    payments: [{ method: "CASH", amountMinor: 9000 }],
  };
  const sale = await request(server)
    .post(`${base}/appointments/${booked.body.id}/checkout`)
    .set(bearer(owner))
    .set("Idempotency-Key", checkoutKey)
    .send(checkoutPayload);
  assert.equal(sale.status, 201);
  assert.equal(sale.body.totalMinor, 9000);
  assert.equal(sale.body.customerId, customer.body.id);
  assert.equal(sale.body.items[0].staffProfileId, staff.body.id);
  const checkedOutAppointment = await request(server)
    .get(`${base}/appointments/${booked.body.id}`)
    .set(bearer(owner));
  assert.equal(checkedOutAppointment.body.sale.id, sale.body.id);
  assert.equal(
    await prisma.stockMovement.count({
      where: { referenceType: "SALE", referenceId: sale.body.id },
    }),
    0,
  );
  const receipt = await request(server)
    .get(`${base}/sales/${sale.body.id}/receipt`)
    .set(bearer(owner));
  assert.equal(receipt.status, 200);
  assert.equal(receipt.body.items[0].productNameSnapshot, "Hair treatment");
  const retry = await request(server)
    .post(`${base}/appointments/${booked.body.id}/checkout`)
    .set(bearer(owner))
    .set("Idempotency-Key", checkoutKey)
    .send(checkoutPayload);
  assert.equal(retry.status, 201);
  assert.equal(retry.body.id, sale.body.id);
  assert.equal(
    await prisma.sale.count({ where: { appointment: { id: booked.body.id } } }),
    1,
  );
  assert.equal(
    await prisma.payment.count({ where: { saleId: sale.body.id } }),
    1,
  );
  assert.equal(
    (
      await request(server)
        .post(`${base}/appointments/${booked.body.id}/checkout`)
        .set(bearer(owner))
        .set("Idempotency-Key", randomUUID())
        .send(checkoutPayload)
    ).status,
    409,
  );
  const commission = await prisma.commission.findFirstOrThrow({
    where: { saleId: sale.body.id },
  });
  assert.equal(commission.baseAmountMinor, 9000);
  assert.equal(commission.commissionAmountMinor, 900);
  assert.equal(commission.appointmentId, booked.body.id);
  assert.equal(
    await prisma.commission.count({ where: { saleId: sale.body.id } }),
    1,
  );

  await request(server)
    .patch(`${base}/commission-rules/${rule.body.id}`)
    .set(bearer(owner))
    .send({ isActive: false });
  await request(server)
    .patch(`${base}/commission-rules/${defaultRule.body.id}`)
    .set(bearer(owner))
    .send({ isActive: false });
  const fixed = await request(server)
    .post(`${base}/commission-rules`)
    .set(bearer(owner))
    .send({
      staffProfileId: staff.body.id,
      serviceProductId: product.body.id,
      type: "FIXED",
      valueMinor: 500,
    });
  assert.equal(fixed.status, 201);
  const direct = await request(server)
    .post(`${base}/sales/checkout`)
    .set(bearer(owner))
    .set("Idempotency-Key", randomUUID())
    .send({
      branchId: org.branchId,
      items: [
        {
          productId: product.body.id,
          staffProfileId: staff.body.id,
          quantity: "1",
        },
      ],
      payments: [{ method: "CASH", amountMinor: 10_000 }],
    });
  assert.equal(direct.status, 201);
  assert.equal(
    (
      await prisma.commission.findFirstOrThrow({
        where: { saleId: direct.body.id },
      })
    ).commissionAmountMinor,
    500,
  );
  const stockProduct = await request(server)
    .post(`${base}/products`)
    .set(bearer(owner))
    .send({
      name: "Shampoo",
      type: "STOCK_ITEM",
      unitId: unit.id,
      priceMinor: 2000,
      costMinor: 800,
      trackInventory: true,
    });
  const location = await prisma.stockLocation.findFirstOrThrow({
    where: { branchId: org.branchId, isDefault: true },
  });
  assert.equal(
    (
      await request(server)
        .post(`${base}/inventory/opening-stock`)
        .set(bearer(owner))
        .set("Idempotency-Key", randomUUID())
        .send({
          branchId: org.branchId,
          locationId: location.id,
          productId: stockProduct.body.id,
          quantity: "5",
        })
    ).status,
    201,
  );
  const mixedSale = await request(server)
    .post(`${base}/sales/checkout`)
    .set(bearer(owner))
    .set("Idempotency-Key", randomUUID())
    .send({
      branchId: org.branchId,
      items: [
        {
          productId: product.body.id,
          staffProfileId: staff.body.id,
          quantity: "1",
        },
        { productId: stockProduct.body.id, quantity: "1" },
      ],
      payments: [{ method: "CASH", amountMinor: 12_000 }],
    });
  assert.equal(mixedSale.status, 201);
  assert.equal(
    (
      await prisma.commission.findFirstOrThrow({
        where: { saleId: mixedSale.body.id },
      })
    ).commissionAmountMinor,
    500,
  );
  assert.equal(
    await prisma.stockMovement.count({
      where: {
        referenceType: "SALE",
        referenceId: mixedSale.body.id,
        productId: stockProduct.body.id,
        movementType: "SALE",
      },
    }),
    1,
  );
  const noRuleStaff = await request(server)
    .post(`${base}/staff`)
    .set(bearer(owner))
    .send({ displayName: "No Rule" });
  await request(server)
    .post(`${base}/staff/${noRuleStaff.body.id}/branches`)
    .set(bearer(owner))
    .send({ branchId: org.branchId });
  await request(server)
    .post(`${base}/staff/${noRuleStaff.body.id}/services`)
    .set(bearer(owner))
    .send({ serviceProductId: product.body.id });
  const noRuleSale = await request(server)
    .post(`${base}/sales/checkout`)
    .set(bearer(owner))
    .set("Idempotency-Key", randomUUID())
    .send({
      branchId: org.branchId,
      items: [
        {
          productId: product.body.id,
          staffProfileId: noRuleStaff.body.id,
          quantity: "1",
        },
      ],
      payments: [{ method: "CASH", amountMinor: 10_000 }],
    });
  assert.equal(noRuleSale.status, 201);
  assert.equal(
    await prisma.commission.count({ where: { saleId: noRuleSale.body.id } }),
    0,
  );
  assert.equal(
    (
      await request(server)
        .get(`${base}/commissions/summary?pageSize=100`)
        .set(bearer(owner))
    ).body.earnedMinor,
    2900,
  );
  const ownAppointments = await request(server)
    .get(`${base}/appointments?pageSize=100`)
    .set(bearer(staffToken));
  assert.equal(ownAppointments.status, 200);
  assert.ok(
    ownAppointments.body.items.every(
      (appointment: { services: Array<{ staffProfileId: string }> }) =>
        appointment.services.some(
          (service) => service.staffProfileId === staff.body.id,
        ),
    ),
  );
  const ownCommissions = await request(server)
    .get(`${base}/commissions?pageSize=100`)
    .set(bearer(staffToken));
  assert.equal(ownCommissions.status, 200);
  assert.ok(
    ownCommissions.body.items.every(
      (row: { staffProfileId: string }) => row.staffProfileId === staff.body.id,
    ),
  );
  assert.equal(
    (
      await request(server)
        .get(`${base}/commission-rules?pageSize=100`)
        .set(bearer(staffToken))
    ).status,
    403,
  );
  assert.notEqual(
    (
      await request(server)
        .get(`${base}/appointments/${booked.body.id}`)
        .set(bearer(foreignOwner))
    ).status,
    200,
  );
  console.log(
    "Phase 5 e2e passed: service configuration, staff tenancy, availability, collision concurrency, lifecycle, checkout idempotency, discounts, and commissions.",
  );
} finally {
  for (const organizationId of organizations.reverse())
    await prisma.organization
      .delete({ where: { id: organizationId } })
      .catch(() => undefined);
  await app.close();
}
