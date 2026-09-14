"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import { Can } from "../components/permission-context";
import { api, selectedOrganization } from "../lib/api";
import { formatMinorCurrency } from "../lib/catalogue";
import type { Paged, Purchase } from "../lib/phase4";

export default function PurchasesPage() {
  const organizationId = selectedOrganization();
  const [rows, setRows] = useState<Purchase[]>([]);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!organizationId) return;
    void api<Paged<Purchase>>(
      `/organizations/${organizationId}/purchases?pageSize=100${status ? `&status=${status}` : ""}`,
    )
      .then((value) => setRows(value.items))
      .catch((error) => setMessage(error.message));
  }, [organizationId, status]);
  return (
    <AppShell title="Purchases">
      <section className="card">
        <div className="toolbar">
          <select
            aria-label="Purchase status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            <option>DRAFT</option>
            <option>PARTIALLY_RECEIVED</option>
            <option>RECEIVED</option>
            <option>CANCELLED</option>
          </select>
          <Can permissions={["purchase.create"]}>
            <Link className="button-link" href="/purchases/new">
              New purchase
            </Link>
          </Can>
        </div>
        {message && <p className="error">{message}</p>}
        <div className="data-table phase4-table">
          <strong>Purchase</strong>
          <strong>Supplier</strong>
          <strong>Date</strong>
          <strong>Status</strong>
          <strong>Total</strong>
          {rows.map((row) => (
            <div className="data-row" key={row.id}>
              <Link href={`/purchases/${row.id}`}>
                <b>{row.purchaseNumber}</b>
              </Link>
              <span>{row.supplier.name}</span>
              <span>{new Date(row.purchaseDate).toLocaleDateString()}</span>
              <span className="pill">{row.status}</span>
              <b>{formatMinorCurrency(row.totalMinor)}</b>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
