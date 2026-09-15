import type { Membership } from "./api";

export function hasAllPermissions(
  membership: Pick<Membership, "permissions"> | undefined,
  ...required: string[]
): boolean {
  if (!membership) return false;
  const held = new Set(membership.permissions);
  return required.every((permission) => held.has(permission));
}

export function hasAnyPermission(
  membership: Pick<Membership, "permissions"> | undefined,
  ...required: string[]
): boolean {
  if (!membership) return false;
  const held = new Set(membership.permissions);
  return required.some((permission) => held.has(permission));
}

const routePermissions: Array<[string, string[]]> = [
  ["/reconciliation", []],
  ["/settings/subscription", ["billing.read"]],
  ["/settings/devices", ["device.read"]],
  ["/settings/users", ["user.read"]],
  ["/settings/branches", ["settings.read", "branch.read"]],
  ["/settings/business", ["settings.read", "organization.read"]],
  ["/inventory/adjustments/new", ["inventory.adjust"]],
  ["/inventory/transfers/new", ["inventory.transfer"]],
  ["/inventory", ["inventory.read"]],
  ["/commission-rules", ["commission_rule.read"]],
  ["/commissions", ["commission.read"]],
  ["/appointments", ["appointment.read"]],
  ["/expense-categories", ["expense_category.read"]],
  ["/expenses/new", ["expense.create"]],
  ["/expenses", ["expense.read"]],
  ["/customers/new", ["customer.create"]],
  ["/customers", ["customer.read"]],
  ["/suppliers/new", ["supplier.create"]],
  ["/suppliers", ["supplier.read"]],
  ["/purchases/new", ["purchase.create"]],
  ["/purchases", ["purchase.read"]],
  ["/products/new", ["product.create"]],
  ["/products", ["catalogue.read"]],
  ["/categories", ["catalogue.read"]],
  ["/brands", ["catalogue.read"]],
  ["/units", ["catalogue.read"]],
  ["/reports", ["report.dashboard"]],
  ["/staff/new", ["staff.create"]],
  ["/staff", ["staff.read"]],
  ["/sales", ["sale.read"]],
  ["/pos/sync", ["sync.read"]],
  ["/pos", ["catalogue.read", "sale.create", "payment.record"]],
  ["/dashboard", ["organization.read"]],
];

export function permissionsForPath(pathname: string): string[] {
  return (
    routePermissions.find(
      ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )?.[1] ?? []
  );
}
