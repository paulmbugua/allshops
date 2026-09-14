"use client";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../components/app-shell";
import { api, selectedOrganization } from "../lib/api";
import { formatMinorCurrency } from "../lib/catalogue";
import {
  downloadReport,
  type DashboardReport,
  type SalesReport,
} from "../lib/reports";

export default function ReportsPage() {
  const organizationId = selectedOrganization();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dashboard, setDashboard] = useState<DashboardReport>();
  const [sales, setSales] = useState<SalesReport>();
  const [message, setMessage] = useState("");
  const query = [from && `dateFrom=${from}`, to && `dateTo=${to}`]
    .filter(Boolean)
    .join("&");

  async function load() {
    if (!organizationId) return;
    setMessage("");
    try {
      const suffix = query ? `?${query}` : "";
      const [nextDashboard, nextSales] = await Promise.all([
        api<DashboardReport>(
          `/organizations/${organizationId}/reports/dashboard${suffix}`,
        ),
        api<SalesReport>(
          `/organizations/${organizationId}/reports/sales${suffix}`,
        ),
      ]);
      setDashboard(nextDashboard);
      setSales(nextSales);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load reports.",
      );
    }
  }
  useEffect(() => {
    if (!organizationId) window.location.assign("/onboarding");
    else void load();
  }, [organizationId]);

  function apply(event: FormEvent) {
    event.preventDefault();
    void load();
  }
  async function exportSales() {
    if (!organizationId) return;
    try {
      await downloadReport(organizationId, "sales", query);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Export failed.");
    }
  }
  return (
    <AppShell title="Reports">
      <section className="card print-hidden">
        <form className="toolbar" onSubmit={apply}>
          <label>
            From
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <button>Apply</button>
          <button
            type="button"
            className="secondary"
            onClick={() => void exportSales()}
          >
            Export sales CSV
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => window.print()}
          >
            Print
          </button>
        </form>
      </section>
      <section className="card">
        <span className="eyebrow">Operational reporting · Asia/Qatar</span>
        <h2>Sales summary</h2>
        {!sales ? (
          <p>{message || "Loading report…"}</p>
        ) : (
          <div className="context-grid">
            <div>
              <small>Net sales</small>
              <strong>{formatMinorCurrency(sales.netSalesMinor)}</strong>
            </div>
            <div>
              <small>Transactions</small>
              <strong>{sales.completedSalesCount}</strong>
            </div>
            <div>
              <small>Average sale</small>
              <strong>{formatMinorCurrency(sales.averageSaleMinor)}</strong>
            </div>
            <div>
              <small>Discounts</small>
              <strong>{formatMinorCurrency(sales.discountMinor)}</strong>
            </div>
            {dashboard?.grossProfit && (
              <div>
                <small>Gross profit</small>
                <strong>
                  {formatMinorCurrency(dashboard.grossProfit.grossProfitMinor)}
                </strong>
              </div>
            )}
            {dashboard?.expenses && (
              <div>
                <small>Recorded expenses</small>
                <strong>
                  {formatMinorCurrency(dashboard.expenses.totalMinor)}
                </strong>
              </div>
            )}
            {dashboard?.receivables && (
              <div>
                <small>Customer outstanding</small>
                <strong>
                  {formatMinorCurrency(
                    dashboard.receivables.customerOutstandingMinor,
                  )}
                </strong>
              </div>
            )}
            {dashboard?.payables && (
              <div>
                <small>Supplier outstanding</small>
                <strong>
                  {formatMinorCurrency(
                    dashboard.payables.supplierOutstandingMinor,
                  )}
                </strong>
              </div>
            )}
            {dashboard?.inventory && (
              <div>
                <small>Low-stock rows</small>
                <strong>{dashboard.inventory.lowStockCount}</strong>
              </div>
            )}
          </div>
        )}
        {message && sales && <p className="error">{message}</p>}
      </section>
    </AppShell>
  );
}
