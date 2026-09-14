"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import { Can } from "../components/permission-context";
import { api, selectedOrganization } from "../lib/api";
import { formatMinorCurrency } from "../lib/catalogue";
import type { Expense, Paged } from "../lib/phase4";

export default function ExpensesPage() {
  const organizationId = selectedOrganization();
  const [rows, setRows] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!organizationId) return;
    void api<Paged<Expense>>(
      `/organizations/${organizationId}/expenses?pageSize=100`,
    )
      .then((value) => {
        setRows(value.items);
        setTotal(value.totalMinor ?? 0);
      })
      .catch((error) => setMessage(error.message));
  }, [organizationId]);
  return (
    <AppShell title="Expenses">
      <section className="card">
        <div className="toolbar">
          <div>
            <small>Recorded total</small>
            <strong>{formatMinorCurrency(total)}</strong>
          </div>
          <Can permissions={["expense.create"]}>
            <Link className="button-link" href="/expenses/new">
              Record expense
            </Link>
          </Can>
        </div>
        {message && <p className="error">{message}</p>}
        <div className="data-table phase4-table">
          <strong>Date</strong>
          <strong>Category</strong>
          <strong>Branch</strong>
          <strong>Method</strong>
          <strong>Amount</strong>
          {rows.map((row) => (
            <div className="data-row" key={row.id}>
              <span>{new Date(row.expenseDate).toLocaleDateString()}</span>
              <span>{row.category.name}</span>
              <span>{row.branch.name}</span>
              <span>{row.paymentMethod}</span>
              <b>{formatMinorCurrency(row.amountMinor)}</b>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
