"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../components/app-shell";
import { api, selectedOrganization } from "../lib/api";
import { formatMinorCurrency } from "../lib/catalogue";
import type { Paged, SaleSummary } from "../lib/sales";
export default function SalesPage() {
  const organizationId = selectedOrganization();
  const [rows, setRows] = useState<Paged<SaleSummary>>({
    items: [],
    page: 1,
    pageSize: 25,
    total: 0,
  });
  const [status, setStatus] = useState("");
  const [invoice, setInvoice] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!organizationId) {
      window.location.assign("/onboarding");
      return;
    }
    void load(1);
  }, [organizationId]);
  async function load(page: number) {
    if (!organizationId) return;
    try {
      setRows(
        await api<Paged<SaleSummary>>(
          `/organizations/${organizationId}/sales?page=${page}&pageSize=25${status ? `&status=${status}` : ""}${invoice ? `&invoiceNumber=${encodeURIComponent(invoice)}` : ""}`,
        ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load sales.",
      );
    }
  }
  function filter(event: FormEvent) {
    event.preventDefault();
    void load(1);
  }
  return (
    <AppShell title="Sales">
      <section className="card">
        <div className="toolbar">
          <form onSubmit={filter}>
            <input
              aria-label="Invoice number"
              placeholder="Search invoice"
              value={invoice}
              onChange={(event) => setInvoice(event.target.value)}
            />
            <select
              aria-label="Sale status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All statuses</option>
              <option>COMPLETED</option>
              <option>HELD</option>
              <option>CANCELLED</option>
            </select>
            <button>Apply</button>
          </form>
          <Link className="button-link" href="/pos">
            New sale
          </Link>
        </div>
        <div className="data-table sales-table">
          <strong>Invoice</strong>
          <strong>Date</strong>
          <strong>Branch</strong>
          <strong>Cashier</strong>
          <strong>Status</strong>
          <strong>Payment</strong>
          <strong>Total</strong>
          {rows.items.map((sale) => (
            <div className="data-row" key={sale.id}>
              <Link href={`/sales/${sale.id}`}>
                <strong>
                  {sale.invoiceNumber ?? `Held ${sale.id.slice(0, 8)}`}
                </strong>
              </Link>
              <span>{new Date(sale.createdAt).toLocaleString("en-QA")}</span>
              <span>{sale.branch.name}</span>
              <span>{sale.creator.name}</span>
              <span
                className={`pill ${sale.status === "COMPLETED" ? "active" : sale.status === "HELD" ? "warning" : ""}`}
              >
                {sale.status}
              </span>
              <span>
                {sale.payments
                  .map((payment) => payment.method.replaceAll("_", " "))
                  .join(" + ") || "—"}
              </span>
              <strong>{formatMinorCurrency(sale.totalMinor)}</strong>
            </div>
          ))}
        </div>
        <div className="pager">
          <button
            className="secondary"
            disabled={rows.page <= 1}
            onClick={() => void load(rows.page - 1)}
          >
            Previous
          </button>
          <span>
            Page {rows.page} · {rows.total} sales
          </span>
          <button
            className="secondary"
            disabled={rows.page * rows.pageSize >= rows.total}
            onClick={() => void load(rows.page + 1)}
          >
            Next
          </button>
        </div>
        {message && <p className="notice">{message}</p>}
      </section>
    </AppShell>
  );
}
