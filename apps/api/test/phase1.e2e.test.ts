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

const suffix = randomUUID().slice(0, 8);
const emails = {
  ownerA: `phase1-owner-a-${suffix}@example.com`,
  ownerB: `phase1-owner-b-${suffix}@example.com`,
  admin: `phase1-admin-${suffix}@example.com`,
  cashier: `phase1-cashier-${suffix}@example.com`,
};
const organizationIds: string[] = [];
const password = "StrongPass123!";
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const cookie = (response: request.Response): string => {
  const value = response.headers["set-cookie"];
  const first = Array.isArray(value) ? value[0] : value;
  assert.ok(first);
  return first.split(";")[0]!;
};

try {
  const registerA = await request(app.getHttpServer())
    .post("/api/v1/auth/register")
    .send({ name: "Owner A", email: emails.ownerA, password });
  assert.equal(registerA.status, 201);
  assert.ok(registerA.body.accessToken);
  assert.equal(registerA.body.refreshToken, undefined);
  const blockedBeforeActivation = await request(app.getHttpServer())
    .post("/api/v1/organizations")
    .set(bearer(registerA.body.accessToken))
    .send({ name: "Blocked Organization", businessType: "RETAIL" });
  assert.equal(blockedBeforeActivation.status, 403);
  assert.equal(
    blockedBeforeActivation.body.code,
    "EMAIL_ACTIVATION_REQUIRED",
  );
  const activatedA = await request(app.getHttpServer())
    .post("/api/v1/auth/activate-account")
    .send({ token: registerA.body.activationToken });
  assert.equal(activatedA.status, 201);
  const tokenA = activatedA.body.accessToken as string;
  const refreshA = cookie(activatedA);

  const duplicate = await request(app.getHttpServer())
    .post("/api/v1/auth/register")
    .send({ name: "Duplicate", email: emails.ownerA.toUpperCase(), password });
  assert.equal(duplicate.status, 409);

  const invalidLogin = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email: emails.ownerA, password: "WrongPass123!" });
  assert.equal(invalidLogin.status, 401);

  const unauthenticatedMe = await request(app.getHttpServer()).get(
    "/api/v1/auth/me",
  );
  assert.equal(unauthenticatedMe.status, 401);

  const createOrgA = await request(app.getHttpServer())
    .post("/api/v1/organizations")
    .set(bearer(tokenA))
    .send({ name: "Organization A", businessType: "RETAIL" });
  assert.equal(createOrgA.status, 201);
  const orgA = createOrgA.body.id as string;
  organizationIds.push(orgA);

  const createBranchA = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/branches`)
    .set(bearer(tokenA))
    .send({ name: "Branch A", code: `A_${suffix.toUpperCase()}` });
  assert.equal(createBranchA.status, 201);
  const branchA = createBranchA.body.id as string;

  const registerB = await request(app.getHttpServer())
    .post("/api/v1/auth/register")
    .send({ name: "Owner B", email: emails.ownerB, password });
  assert.equal(registerB.status, 201);
  const activatedB = await request(app.getHttpServer())
    .post("/api/v1/auth/activate-account")
    .send({ token: registerB.body.activationToken });
  assert.equal(activatedB.status, 201);
  const tokenB = activatedB.body.accessToken as string;

  const createOrgB = await request(app.getHttpServer())
    .post("/api/v1/organizations")
    .set(bearer(tokenB))
    .send({ name: "Organization B", businessType: "GROCERY" });
  assert.equal(createOrgB.status, 201);
  const orgB = createOrgB.body.id as string;
  organizationIds.push(orgB);

  const createBranchB = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgB}/branches`)
    .set(bearer(tokenB))
    .send({ name: "Branch B", code: `B_${suffix.toUpperCase()}` });
  assert.equal(createBranchB.status, 201);
  const branchB = createBranchB.body.id as string;

  assert.equal(
    (
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgB}`)
        .set(bearer(tokenA))
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgA}`)
        .set(bearer(tokenB))
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgA}/branches/${branchB}`)
        .set(bearer(tokenA))
    ).status,
    404,
  );

  const roles = await request(app.getHttpServer())
    .get(`/api/v1/organizations/${orgA}/roles`)
    .set(bearer(tokenA));
  assert.equal(roles.status, 200);
  type RoleRow = {
    id: string;
    code: string;
    permissions: Array<{ permission: { code: string } }>;
  };
  const roleRows = roles.body as RoleRow[];
  const cashierRole = roleRows.find((role) => role.code === "CASHIER");
  const supervisorRole = (roles.body as RoleRow[]).find(
    (role) => role.code === "POS_SUPERVISOR",
  );
  const branchManagerRole = roleRows.find(
    (role) => role.code === "BRANCH_MANAGER",
  );
  const adminRole = roleRows.find((role) => role.code === "ADMIN");
  const ownerRole = roleRows.find((role) => role.code === "OWNER");
  assert.ok(cashierRole);
  assert.ok(supervisorRole);
  assert.ok(branchManagerRole);
  assert.ok(adminRole);
  assert.ok(ownerRole);
  const rolePermissionCodes = (role: RoleRow) =>
    role.permissions.map(({ permission }) => permission.code);
  assert.ok(
    rolePermissionCodes(supervisorRole).includes("sync.conflict.resolve"),
  );
  assert.ok(
    !rolePermissionCodes(cashierRole).includes("sync.conflict.resolve"),
  );
  assert.ok(!rolePermissionCodes(branchManagerRole).includes("branch.create"));
  assert.ok(
    !rolePermissionCodes(branchManagerRole).includes("settings.update"),
  );

  const adminInvite = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/users`)
    .set(bearer(tokenA))
    .send({ name: "Administrator", email: emails.admin, roleId: adminRole.id });
  assert.equal(adminInvite.status, 201);
  const adminAccept = await request(app.getHttpServer())
    .post("/api/v1/auth/accept-invite")
    .send({ token: adminInvite.body.invitationToken, password });
  assert.equal(adminAccept.status, 201);
  const adminToken = adminAccept.body.accessToken as string;
  const adminRoles = await request(app.getHttpServer())
    .get(`/api/v1/organizations/${orgA}/roles`)
    .set(bearer(adminToken));
  assert.equal(adminRoles.status, 200);
  assert.ok(
    !(adminRoles.body as RoleRow[]).some((role) => role.code === "OWNER"),
  );
  const ownerEscalation = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/users`)
    .set(bearer(adminToken))
    .send({
      name: "Forbidden owner",
      email: `forbidden-owner-${suffix}@example.com`,
      roleId: ownerRole.id,
    });
  assert.equal(ownerEscalation.status, 403);
  assert.equal(ownerEscalation.body.code, "ROLE_ESCALATION_FORBIDDEN");

  const unscopedSupervisor = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/users`)
    .set(bearer(tokenA))
    .send({
      name: "Unscoped supervisor",
      email: `unscoped-${suffix}@example.com`,
      roleId: supervisorRole.id,
    });
  assert.equal(unscopedSupervisor.status, 403);
  assert.equal(unscopedSupervisor.body.code, "BRANCH_ASSIGNMENT_REQUIRED");

  const foreignBranchInvite = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/users`)
    .set(bearer(tokenA))
    .send({
      name: "Foreign",
      email: `foreign-${suffix}@example.com`,
      roleId: cashierRole.id,
      branchId: branchB,
    });
  assert.equal(foreignBranchInvite.status, 404);

  const invite = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/users`)
    .set(bearer(tokenA))
    .send({
      name: "Cashier",
      email: emails.cashier,
      roleId: cashierRole.id,
      branchId: branchA,
    });
  assert.equal(invite.status, 201);
  assert.ok(invite.body.invitationToken);

  const accept = await request(app.getHttpServer())
    .post("/api/v1/auth/accept-invite")
    .send({ token: invite.body.invitationToken, password });
  assert.equal(accept.status, 201);
  const cashierToken = accept.body.accessToken as string;

  const cashierMe = await request(app.getHttpServer())
    .get("/api/v1/auth/me")
    .set(bearer(cashierToken));
  assert.equal(cashierMe.status, 200);
  const cashierMembership = cashierMe.body.memberships.find(
    (membership: { organizationId: string }) =>
      membership.organizationId === orgA,
  );
  assert.ok(cashierMembership.permissions.includes("sale.create"));
  assert.ok(cashierMembership.permissions.includes("payment.record"));
  assert.ok(!cashierMembership.permissions.includes("inventory.adjust"));
  assert.ok(!cashierMembership.permissions.includes("sync.conflict.resolve"));

  const deniedRoleDirectory = await request(app.getHttpServer())
    .get(`/api/v1/organizations/${orgA}/roles`)
    .set(bearer(cashierToken));
  assert.equal(deniedRoleDirectory.status, 403);

  const deniedConflictRecovery = await request(app.getHttpServer())
    .post(
      `/api/v1/organizations/${orgA}/sync/conflicts/${randomUUID()}/resolve`,
    )
    .set(bearer(cashierToken))
    .send({ action: "REJECT" });
  assert.equal(deniedConflictRecovery.status, 403);

  const reusedInvite = await request(app.getHttpServer())
    .post("/api/v1/auth/accept-invite")
    .send({ token: invite.body.invitationToken, password });
  assert.equal(reusedInvite.status, 401);

  const cashierBranches = await request(app.getHttpServer())
    .get(`/api/v1/organizations/${orgA}/branches`)
    .set(bearer(cashierToken));
  assert.equal(cashierBranches.status, 200);
  assert.deepEqual(
    (cashierBranches.body as Array<{ id: string }>).map((branch) => branch.id),
    [branchA],
  );

  const deniedBranch = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/branches`)
    .set(bearer(cashierToken))
    .send({ name: "Forbidden", code: "FORBIDDEN" });
  assert.equal(deniedBranch.status, 403);
  const deniedInvite = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${orgA}/users`)
    .set(bearer(cashierToken))
    .send({
      name: "Forbidden",
      email: `denied-${suffix}@example.com`,
      roleId: cashierRole.id,
    });
  assert.equal(deniedInvite.status, 403);
  const deniedOrganizationUpdate = await request(app.getHttpServer())
    .patch(`/api/v1/organizations/${orgA}`)
    .set(bearer(cashierToken))
    .send({ name: "Compromised" });
  assert.equal(deniedOrganizationUpdate.status, 403);

  const refresh = await request(app.getHttpServer())
    .post("/api/v1/auth/refresh")
    .set("Cookie", refreshA);
  assert.equal(refresh.status, 201);
  assert.ok(refresh.body.accessToken);
  assert.notEqual(cookie(refresh), refreshA);
  assert.equal(
    (
      await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("Cookie", refreshA)
    ).status,
    401,
  );

  const login = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email: emails.ownerB, password });
  assert.equal(login.status, 201);
  const loginCookie = cookie(login);
  assert.equal(
    (
      await request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .set("Cookie", loginCookie)
    ).status,
    201,
  );
  assert.equal(
    (
      await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("Cookie", loginCookie)
    ).status,
    401,
  );

  console.log(
    "Phase 1 integration passed: auth rotation, tenant isolation, branch scope, invitations, and permission enforcement.",
  );
} finally {
  await prisma.organization.deleteMany({
    where: { id: { in: organizationIds } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: Object.values(emails) } },
  });
  await app.close();
}
