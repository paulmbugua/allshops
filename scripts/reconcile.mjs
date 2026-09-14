import { prisma } from "@allshops/database";

const environment = process.env.OPS_ENVIRONMENT;
if (
  !environment ||
  !["development", "staging", "production"].includes(environment)
)
  throw new Error(
    "Set OPS_ENVIRONMENT to development, staging, or production.",
  );
if (
  environment === "production" &&
  process.env.OPS_CONFIRM_PRODUCTION_READ_ONLY !== "YES"
)
  throw new Error(
    "Production read-only reconciliation requires OPS_CONFIRM_PRODUCTION_READ_ONLY=YES.",
  );

const kind = process.argv[2];
let mismatches = [];
try {
  if (kind === "inventory") {
    const [balances, movements] = await Promise.all([
      prisma.inventoryBalance.findMany(),
      prisma.stockMovement.groupBy({
        by: [
          "organizationId",
          "branchId",
          "locationId",
          "productId",
          "variantId",
        ],
        _sum: { quantity: true },
      }),
    ]);
    const ledger = new Map(
      movements.map((row) => [
        [
          row.organizationId,
          row.branchId,
          row.locationId,
          row.productId,
          row.variantId ?? "BASE",
        ].join(":"),
        row._sum.quantity?.toString() ?? "0",
      ]),
    );
    mismatches = balances
      .filter(
        (row) =>
          row.quantity.comparedTo(
            ledger.get(
              [
                row.organizationId,
                row.branchId,
                row.locationId,
                row.productId,
                row.variantId ?? "BASE",
              ].join(":"),
            ) ?? "0",
          ) !== 0,
      )
      .map((row) => ({
        organizationId: row.organizationId,
        branchId: row.branchId,
        bucketKey: row.bucketKey,
      }));
  } else if (kind === "customers") {
    const customers = await prisma.customer.findMany({
      include: {
        ledger: {
          orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
          take: 1,
        },
      },
    });
    mismatches = customers
      .filter(
        (row) => row.balanceMinor !== (row.ledger[0]?.balanceAfterMinor ?? 0),
      )
      .map((row) => ({
        organizationId: row.organizationId,
        customerId: row.id,
      }));
  } else if (kind === "suppliers") {
    const purchases = await prisma.purchase.findMany({
      where: { status: { in: ["PARTIALLY_RECEIVED", "RECEIVED"] } },
      select: {
        id: true,
        organizationId: true,
        supplierId: true,
        totalMinor: true,
        paidMinor: true,
        balanceMinor: true,
      },
    });
    mismatches = purchases
      .filter((row) => row.balanceMinor !== row.totalMinor - row.paidMinor)
      .map((row) => ({
        organizationId: row.organizationId,
        supplierId: row.supplierId,
        purchaseId: row.id,
      }));
  } else if (kind === "subscriptions") {
    const subscriptions = await prisma.subscription.findMany({
      include: { billingRecords: true },
    });
    mismatches = subscriptions
      .filter((row) =>
        row.billingRecords.some(
          (bill) =>
            bill.organizationId !== row.organizationId ||
            bill.subscriptionId !== row.id,
        ),
      )
      .map((row) => ({
        organizationId: row.organizationId,
        subscriptionId: row.id,
      }));
  } else
    throw new Error(
      "Expected inventory, customers, suppliers, or subscriptions.",
    );
  console.log(
    JSON.stringify(
      { kind, environment, mismatchCount: mismatches.length, mismatches },
      null,
      2,
    ),
  );
  if (mismatches.length) process.exitCode = 2;
} finally {
  await prisma.$disconnect();
}
