import { argon2id, hash } from "argon2";
import { prisma } from "@allshops/database";

const email = process.env.PLAY_REVIEWER_EMAIL?.trim().toLowerCase();
const password = process.env.PLAY_REVIEWER_PASSWORD;
const organizationMarker = "ALLSHOPS-PLAY-REVIEW";

if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
  throw new Error("PLAY_REVIEWER_EMAIL must be a valid email address.");
}
if (!password || password.length < 8) {
  throw new Error("PLAY_REVIEWER_PASSWORD must contain at least 8 characters.");
}

const passwordHash = await hash(password, {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
});

try {
  const result = await prisma.$transaction(async (tx) => {
    const [ownerRole, plan] = await Promise.all([
      tx.role.findFirst({
        where: { organizationId: null, code: "OWNER", isSystemRole: true },
      }),
      tx.plan.findUnique({ where: { code: "GROWTH" } }),
    ]);
    if (!ownerRole || !plan) {
      throw new Error(
        "Run the database seed before provisioning the reviewer.",
      );
    }

    const user = await tx.user.upsert({
      where: { email },
      update: {
        name: "Google Play Reviewer",
        passwordHash,
        emailVerifiedAt: new Date(),
        status: "ACTIVE",
        isPlatformAdmin: false,
      },
      create: {
        name: "Google Play Reviewer",
        email,
        passwordHash,
        emailVerifiedAt: new Date(),
        status: "ACTIVE",
      },
    });

    let organization = await tx.organization.findFirst({
      where: { registrationNumber: organizationMarker },
    });
    if (!organization) {
      organization = await tx.organization.create({
        data: {
          name: "AllShops Play Review Store",
          arabicName: "متجر مراجعة أول شوبس",
          businessType: "RETAIL",
          registrationNumber: organizationMarker,
          email,
          employeePrefix: "A",
          nextEmployeeNumber: 2,
          nextBranchNumber: 2,
          status: "ACTIVE",
          welcomeHeadline: "Welcome to the AllShops review workspace",
          tagline: "A safe, fully featured demonstration store",
          motto: "Sell beautifully. Operate confidently.",
          brandPrimaryColor: "#6D1734",
          brandAccentColor: "#FFCF5C",
        },
      });
    } else {
      organization = await tx.organization.update({
        where: { id: organization.id },
        data: { status: "ACTIVE", email },
      });
    }

    const branch = await tx.branch.upsert({
      where: {
        organizationId_code: {
          organizationId: organization.id,
          code: "DOHA-001",
        },
      },
      update: { name: "Doha Review Branch", isActive: true },
      create: {
        organizationId: organization.id,
        name: "Doha Review Branch",
        code: "DOHA-001",
        address: "Doha, Qatar",
        timezone: "Asia/Qatar",
      },
    });

    await tx.organizationUser.upsert({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: user.id,
        },
      },
      update: { roleId: ownerRole.id, branchId: null, status: "ACTIVE" },
      create: {
        organizationId: organization.id,
        userId: user.id,
        roleId: ownerRole.id,
        employeeNumber: "A-0001",
        status: "ACTIVE",
      },
    });

    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 10);
    await tx.subscription.upsert({
      where: { organizationId: organization.id },
      update: {
        planId: plan.id,
        pendingPlanId: null,
        status: "ACTIVE",
        billingInterval: "ANNUAL",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        activatedAt: periodStart,
        trialEndsAt: null,
        graceEndsAt: null,
        suspendedAt: null,
        cancelledAt: null,
      },
      create: {
        organizationId: organization.id,
        planId: plan.id,
        status: "ACTIVE",
        billingInterval: "ANNUAL",
        currency: "QAR",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        activatedAt: periodStart,
      },
    });

    await tx.accountToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.authSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        action: "PLAY_REVIEW_ACCOUNT_PROVISIONED",
        entityType: "User",
        entityId: user.id,
        afterJson: { email, branchId: branch.id, plan: plan.code },
      },
    });
    return { email, organization: organization.name, branch: branch.name };
  });

  console.log(`Reviewer account ready: ${result.email}`);
  console.log(`Workspace: ${result.organization} / ${result.branch}`);
} finally {
  await prisma.$disconnect();
}
