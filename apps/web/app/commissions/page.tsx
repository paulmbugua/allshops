"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import { api, selectedOrganization } from "../lib/api";
import { formatMinorCurrency } from "../lib/catalogue";
import type { Commission, Paged } from "../lib/phase5";

export default function CommissionsPage() {
  const organizationId = selectedOrganization();
  const [rows, setRows] = useState<Commission[]>([]);
  const [summary, setSummary] = useState({
    earnedMinor: 0,
    commissionCount: 0,
  });
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!organizationId) return;
    void Promise.all([
      api<Paged<Commission>>(
        `/organizations/${organizationId}/commissions?pageSize=100`,
      ),
      api<{ earnedMinor: number; commissionCount: number }>(
        `/organizations/${organizationId}/commissions/summary?pageSize=100`,
      ),
    ])
      .then(([list, totals]) => {
        setRows(list.items);
        setSummary(totals);
      })
      .catch((error: Error) => setMessage(error.message));
  }, [organizationId]);
  return (
    <AppShell title="Commissions">
      <section className="metrics">
        <article>
          <span>Earned commission</span>
          <strong>{formatMinorCurrency(summary.earnedMinor)}</strong>
        </article>
        <article>
          <span>Commission lines</span>
          <strong>{summary.commissionCount}</strong>
        </article>
      </section>
      <section className="card">
        {message && <p className="error">{message}</p>}
        <div className="data-table">
          <strong>Date</strong>
          <strong>Staff</strong>
          <strong>Service</strong>
          <strong>Sale</strong>
          <strong>Base</strong>
          <strong>Commission</strong>
          {rows.map((row) => (
            <div className="data-row" key={row.id}>
              <span>{new Date(row.earnedAt).toLocaleString()}</span>
              <b>{row.staffProfile.displayName}</b>
              <span>{row.saleItem.productNameSnapshot}</span>
              <Link href={`/sales/${row.sale.id}`}>
                {row.sale.invoiceNumber}
              </Link>
              <span>{formatMinorCurrency(row.baseAmountMinor)}</span>
              <b>{formatMinorCurrency(row.commissionAmountMinor)}</b>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
