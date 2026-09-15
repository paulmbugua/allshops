"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
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
import { LanguageToggle, useLanguage } from "./language-provider";

export function AppShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [membership, setMembership] = useState<Membership>();
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState(5);
  const [brand, setBrand] = useState({ primary: "#087F5B", accent: "#FFCF5C" });
  const { t } = useLanguage();
  const pathname = usePathname();
  useEffect(() => {
    const organizationId = selectedOrganization();
    if (!organizationId) return;
    void api<CurrentUser>("/auth/me")
      .then((user) => {
        setMembership(
          user.memberships.find((row) => row.organizationId === organizationId),
        );
        return api<{
          idleTimeoutMinutes: number;
          brandPrimaryColor?: string;
          brandAccentColor?: string;
        }>(`/organizations/${organizationId}`);
      })
      .then((organization) => {
        setIdleTimeoutMinutes(organization.idleTimeoutMinutes);
        setBrand({
          primary: organization.brandPrimaryColor ?? "#087F5B",
          accent: organization.brandAccentColor ?? "#FFCF5C",
        });
      })
      .catch(() => undefined);
  }, []);
  const can = (...permissions: string[]) =>
    hasAllPermissions(membership, ...permissions);
  const any = (...permissions: string[]) =>
    hasAnyPermission(membership, ...permissions);
  const routeAllowed = pathname.startsWith("/reconciliation")
    ? any("reconciliation.submit", "reconciliation.read_all")
    : hasAllPermissions(membership, ...permissionsForPath(pathname));
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
    <div
      className="app-layout"
      style={
        {
          "--brand": brand.primary,
          "--brand-accent": brand.accent,
        } as CSSProperties
      }
    >
      <aside>
        <Link className="brand" href="/dashboard">
          AllShops
        </Link>
        <nav>
          {can("organization.read") && (
            <Link href="/dashboard">{t("Dashboard")}</Link>
          )}
          {any("sale.create", "sale.read", "sync.read") && (
            <small>{t("Sales")}</small>
          )}
          {can("catalogue.read", "sale.create", "payment.record") && (
            <Link href="/pos">{t("Point of Sale")}</Link>
          )}
          {can("sync.read") && (
            <Link href="/pos/sync">{t("Offline sync")}</Link>
          )}
          {can("sale.read") && <Link href="/sales">{t("Sales history")}</Link>}
          {can("report.dashboard") && (
            <Link href="/reports">{t("Reports")}</Link>
          )}
          {any("reconciliation.submit", "reconciliation.read_all") && (
            <Link href="/reconciliation">{t("End-of-day cash-up")}</Link>
          )}
          {any("appointment.read", "staff.read", "commission.read") && (
            <small>{t("Services")}</small>
          )}
          {can("appointment.read") && (
            <Link href="/appointments">{t("Appointments")}</Link>
          )}
          {can("staff.read") && <Link href="/staff">{t("Staff")}</Link>}
          {can("commission.read") && (
            <Link href="/commissions">{t("Commissions")}</Link>
          )}
          {can("commission_rule.read") && (
            <Link href="/commission-rules">{t("Commission rules")}</Link>
          )}
          {can("catalogue.read") && <small>{t("Catalogue")}</small>}
          {can("catalogue.read") && (
            <Link href="/products">{t("Products")}</Link>
          )}
          {can("catalogue.read") && (
            <Link href="/categories">{t("Categories")}</Link>
          )}
          {can("catalogue.read") && <Link href="/brands">{t("Brands")}</Link>}
          {can("catalogue.read") && <Link href="/units">{t("Units")}</Link>}
          {can("inventory.read") && <small>{t("Inventory")}</small>}
          {can("inventory.read") && (
            <Link href="/inventory">{t("Current stock")}</Link>
          )}
          {can("inventory.read") && (
            <Link href="/inventory/movements">{t("Movements")}</Link>
          )}
          {can("inventory.read") && (
            <Link href="/inventory/transfers">{t("Transfers")}</Link>
          )}
          {any("purchase.read", "supplier.read") && (
            <small>{t("Purchasing")}</small>
          )}
          {can("purchase.read") && (
            <Link href="/purchases">{t("Purchases")}</Link>
          )}
          {can("supplier.read") && (
            <Link href="/suppliers">{t("Suppliers")}</Link>
          )}
          {can("customer.read") && <small>{t("Customers")}</small>}
          {can("customer.read") && (
            <Link href="/customers">{t("Customers & credit")}</Link>
          )}
          {any("expense.read", "expense_category.read") && (
            <small>{t("Expenses")}</small>
          )}
          {can("expense.read") && (
            <Link href="/expenses">{t("Expense history")}</Link>
          )}
          {can("expense_category.read") && (
            <Link href="/expense-categories">{t("Categories")}</Link>
          )}
          {any("settings.read", "user.read", "device.read", "billing.read") && (
            <small>{t("Settings")}</small>
          )}
          {can("settings.read", "organization.read") && (
            <Link href="/settings/business">{t("Business")}</Link>
          )}
          {can("settings.read", "branch.read") && (
            <Link href="/settings/branches">{t("Branches")}</Link>
          )}
          {can("user.read") && <Link href="/settings/users">{t("Users")}</Link>}
          {can("device.read") && (
            <Link href="/settings/devices">{t("POS devices")}</Link>
          )}
          {can("billing.read") && (
            <Link href="/settings/subscription">{t("Subscription")}</Link>
          )}
          {can("organization.read") && (
            <Link href="/support/diagnostics">{t("Help & diagnostics")}</Link>
          )}
        </nav>
        <button className="link-button" onClick={() => void leaveForWelcome()}>
          {t("Sign out")}
        </button>
      </aside>
      <main className="workspace">
        <header>
          <h1>{t(title)}</h1>
          <LanguageToggle />
          <OfflineStatus />
        </header>
        {can("billing.read") && <SubscriptionBanner />}
        {!membership ? (
          <section className="card">
            <p>{t("Loading your access…")}</p>
          </section>
        ) : routeAllowed ? (
          <PermissionProvider permissions={membership.permissions}>
            {children}
          </PermissionProvider>
        ) : (
          <section className="card">
            <span className="eyebrow">{t("Restricted workspace")}</span>
            <h2>{t("Access not assigned")}</h2>
            <p>
              {t(
                "Your role does not include the permission required for this area. Ask an owner or administrator to update your role.",
              )}
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
