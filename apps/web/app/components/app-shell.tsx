"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  api,
  clearSession,
  selectedOrganization,
  type CurrentUser,
  type Membership,
} from "../lib/api";
import {
  hasAllPermissions,
  hasAnyPermission,
  permissionsForPath,
} from "../lib/permissions";
import { OfflineStatus } from "./offline-status";
import { PermissionProvider } from "./permission-context";
import { SubscriptionBanner } from "./subscription-banner";

export function AppShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [membership, setMembership] = useState<Membership>();
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState(5);
  const pathname = usePathname();
  useEffect(() => {
    const organizationId = selectedOrganization();
    if (!organizationId) return;
    void api<CurrentUser>("/auth/me")
      .then((user) => {
        setMembership(
          user.memberships.find((row) => row.organizationId === organizationId),
        );
        return api<{ idleTimeoutMinutes: number }>(
          `/organizations/${organizationId}`,
        );
      })
      .then((organization) =>
        setIdleTimeoutMinutes(organization.idleTimeoutMinutes),
      )
      .catch(() => undefined);
  }, []);
  const can = (...permissions: string[]) =>
    hasAllPermissions(membership, ...permissions);
  const any = (...permissions: string[]) =>
    hasAnyPermission(membership, ...permissions);
  const routeAllowed = hasAllPermissions(
    membership,
    ...permissionsForPath(pathname),
  );
  async function leaveForWelcome(reason: "logout" | "idle" = "logout") {
    const organizationId = selectedOrganization();
    await Promise.race([
      api("/auth/logout", { method: "POST" }).catch(() => undefined),
      new Promise((resolve) => window.setTimeout(resolve, 2_000)),
    ]);
    clearSession();
    window.location.assign(
      organizationId
        ? `/welcome?organization=${encodeURIComponent(organizationId)}&reason=${reason}`
        : "/",
    );
  }
  useEffect(() => {
    if (!membership) return;
    let timer = 0;
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(
        () => void leaveForWelcome("idle"),
        idleTimeoutMinutes * 60_000,
      );
    };
    const events = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((event) =>
      window.addEventListener(event, reset, { passive: true }),
    );
    reset();
    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [membership, idleTimeoutMinutes]);
  return (
    <div className="app-layout">
      <aside>
        <Link className="brand" href="/dashboard">
          AllShops
        </Link>
        <nav>
          {can("organization.read") && <Link href="/dashboard">Dashboard</Link>}
          {any("sale.create", "sale.read", "sync.read") && <small>Sales</small>}
          {can("catalogue.read", "sale.create", "payment.record") && (
            <Link href="/pos">Point of Sale</Link>
          )}
          {can("sync.read") && <Link href="/pos/sync">Offline sync</Link>}
          {can("sale.read") && <Link href="/sales">Sales history</Link>}
          {can("report.dashboard") && <Link href="/reports">Reports</Link>}
          {any("appointment.read", "staff.read", "commission.read") && (
            <small>Services</small>
          )}
          {can("appointment.read") && (
            <Link href="/appointments">Appointments</Link>
          )}
          {can("staff.read") && <Link href="/staff">Staff</Link>}
          {can("commission.read") && (
            <Link href="/commissions">Commissions</Link>
          )}
          {can("commission_rule.read") && (
            <Link href="/commission-rules">Commission rules</Link>
          )}
          {can("catalogue.read") && <small>Catalogue</small>}
          {can("catalogue.read") && <Link href="/products">Products</Link>}
          {can("catalogue.read") && <Link href="/categories">Categories</Link>}
          {can("catalogue.read") && <Link href="/brands">Brands</Link>}
          {can("catalogue.read") && <Link href="/units">Units</Link>}
          {can("inventory.read") && <small>Inventory</small>}
          {can("inventory.read") && (
            <Link href="/inventory">Current stock</Link>
          )}
          {can("inventory.read") && (
            <Link href="/inventory/movements">Movements</Link>
          )}
          {can("inventory.read") && (
            <Link href="/inventory/transfers">Transfers</Link>
          )}
          {any("purchase.read", "supplier.read") && <small>Purchasing</small>}
          {can("purchase.read") && <Link href="/purchases">Purchases</Link>}
          {can("supplier.read") && <Link href="/suppliers">Suppliers</Link>}
          {can("customer.read") && <small>Customers</small>}
          {can("customer.read") && (
            <Link href="/customers">Customers &amp; credit</Link>
          )}
          {any("expense.read", "expense_category.read") && (
            <small>Expenses</small>
          )}
          {can("expense.read") && <Link href="/expenses">Expense history</Link>}
          {can("expense_category.read") && (
            <Link href="/expense-categories">Categories</Link>
          )}
          {any("settings.read", "user.read", "device.read", "billing.read") && (
            <small>Settings</small>
          )}
          {can("settings.read", "organization.read") && (
            <Link href="/settings/business">Business</Link>
          )}
          {can("settings.read", "branch.read") && (
            <Link href="/settings/branches">Branches</Link>
          )}
          {can("user.read") && <Link href="/settings/users">Users</Link>}
          {can("device.read") && (
            <Link href="/settings/devices">POS devices</Link>
          )}
          {can("billing.read") && (
            <Link href="/settings/subscription">Subscription</Link>
          )}
          {can("organization.read") && (
            <Link href="/support/diagnostics">Help & diagnostics</Link>
          )}
        </nav>
        <button className="link-button" onClick={() => void leaveForWelcome()}>
          Sign out
        </button>
      </aside>
      <main className="workspace">
        <header>
          <h1>{title}</h1>
          <OfflineStatus />
        </header>
        {can("billing.read") && <SubscriptionBanner />}
        {!membership ? (
          <section className="card">
            <p>Loading your access…</p>
          </section>
        ) : routeAllowed ? (
          <PermissionProvider permissions={membership.permissions}>
            {children}
          </PermissionProvider>
        ) : (
          <section className="card">
            <span className="eyebrow">Restricted workspace</span>
            <h2>Access not assigned</h2>
            <p>
              Your role does not include the permission required for this area.
              Ask an owner or administrator to update your role.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
