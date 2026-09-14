"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import {
  api,
  selectOrganization,
  selectedOrganization,
  type CurrentUser,
  type Membership,
} from "../lib/api";
import { formatMinorCurrency } from "../lib/catalogue";
import type { DashboardReport } from "../lib/reports";

interface Branch {
  id: string;
  name: string;
  code: string;
}

export default function DashboardPage() {
  const [user, setUser] = useState<CurrentUser>();
  const [membership, setMembership] = useState<Membership>();
  const [branch, setBranch] = useState<Branch>();
  const [error, setError] = useState("");
  const [report, setReport] = useState<DashboardReport>();
  useEffect(() => {
    void (async () => {
      try {
        const current = await api<CurrentUser>("/auth/me");
        const organizationId =
          selectedOrganization() ?? current.memberships[0]?.organizationId;
        if (!organizationId) {
          window.location.assign("/onboarding");
          return;
        }
        selectOrganization(organizationId);
        const active = current.memberships.find(
          (item) => item.organizationId === organizationId,
        );
        const branches = await api<Branch[]>(
          `/organizations/${organizationId}/branches`,
        );
        setUser(current);
        setMembership(active);
        setBranch(branches[0]);
        await api<DashboardReport>(
          `/organizations/${organizationId}/reports/dashboard`,
        )
          .then(setReport)
          .catch(() => undefined);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load dashboard.",
        );
      }
    })();
  }, []);
  return (
    <AppShell title="Dashboard">
      <section className="card">
        {error ? (
          <p className="error">{error}</p>
        ) : !user || !membership ? (
          <p>Loading your workspace…</p>
        ) : (
          <>
            <span className="eyebrow">Your business setup is ready</span>
            <h2>Welcome to AllShops</h2>
            <div className="context-grid">
              <div>
                <small>Business</small>
                <strong>{membership.organizationName}</strong>
              </div>
              <div>
                <small>Branch</small>
                <strong>
                  {membership.branchName ?? branch?.name ?? "All branches"}
                </strong>
              </div>
              <div>
                <small>Signed in as</small>
                <strong>
                  {user.name} — {membership.roleName}
                </strong>
              </div>
            </div>
            {report && (
              <>
                <h2>Business snapshot</h2>
                <div className="context-grid">
                  {report.sales && (
                    <div>
                      <small>Net sales</small>
                      <strong>
                        {formatMinorCurrency(report.sales.netSalesMinor)}
                      </strong>
                    </div>
                  )}
                  {report.grossProfit && (
                    <div>
                      <small>Gross profit</small>
                      <strong>
                        {formatMinorCurrency(
                          report.grossProfit.grossProfitMinor,
                        )}
                      </strong>
                    </div>
                  )}
                  {report.expenses && (
                    <div>
                      <small>Expenses</small>
                      <strong>
                        {formatMinorCurrency(report.expenses.totalMinor)}
                      </strong>
                    </div>
                  )}
                  {report.receivables && (
                    <div>
                      <small>Customers owe</small>
                      <strong>
                        {formatMinorCurrency(
                          report.receivables.customerOutstandingMinor,
                        )}
                      </strong>
                    </div>
                  )}
                  {report.payables && (
                    <div>
                      <small>Owed to suppliers</small>
                      <strong>
                        {formatMinorCurrency(
                          report.payables.supplierOutstandingMinor,
                        )}
                      </strong>
                    </div>
                  )}
                  {report.inventory && (
                    <div>
                      <small>Low-stock rows</small>
                      <strong>{report.inventory.lowStockCount}</strong>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </section>
    </AppShell>
  );
}
