import type { Prisma } from "@allshops/database";

type Transaction = Prisma.TransactionClient;

export function employeePrefix(name: string): string {
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];
  if (words.length === 0) return "EMP";
  return words
    .slice(0, 3)
    .map((word) => word[0]!)
    .join("")
    .toUpperCase();
}

export function formatEmployeeNumber(prefix: string, sequence: number) {
  return `${prefix}-${String(sequence).padStart(4, "0")}`;
}

export function formatBranchCode(name: string, sequence: number) {
  const label =
    name
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "Branch";
  return `${label}-${String(sequence).padStart(3, "0")}`;
}

export async function allocateEmployeeNumber(
  tx: Transaction,
  organizationId: string,
) {
  const organization = await tx.organization.update({
    where: { id: organizationId },
    data: { nextEmployeeNumber: { increment: 1 } },
    select: { employeePrefix: true, nextEmployeeNumber: true },
  });
  return formatEmployeeNumber(
    organization.employeePrefix,
    organization.nextEmployeeNumber - 1,
  );
}

export async function allocateBranchCode(
  tx: Transaction,
  organizationId: string,
  name: string,
) {
  const organization = await tx.organization.update({
    where: { id: organizationId },
    data: { nextBranchNumber: { increment: 1 } },
    select: { nextBranchNumber: true },
  });
  return formatBranchCode(name, organization.nextBranchNumber - 1);
}
