"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import { Can } from "../components/permission-context";
import { api, selectedOrganization } from "../lib/api";
import { formatMinorCurrency } from "../lib/catalogue";
import type { Paged, Supplier } from "../lib/phase4";

export default function SuppliersPage() {
  const organizationId = selectedOrganization();
  const [rows, setRows] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!organizationId) return;
    const timer = window.setTimeout(
      () =>
        void api<Paged<Supplier>>(
          `/organizations/${organizationId}/suppliers?pageSize=100&search=${encodeURIComponent(search)}`,
        )
          .then((value) => setRows(value.items))
          .catch((error) => setMessage(error.message)),
      200,
    );
    return () => window.clearTimeout(timer);
  }, [organizationId, search]);
  return (
    <AppShell title="Suppliers">
      <section className="card">
        <div className="toolbar">
          <input
            aria-label="Search suppliers"
            placeholder="Search supplier, contact, phone or email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Can permissions={["supplier.create"]}>
            <Link className="button-link" href="/suppliers/new">
              New supplier
            </Link>
          </Can>
        </div>
        {message && <p className="error">{message}</p>}
        <div className="data-table phase4-table">
          <strong>Supplier</strong>
          <strong>Contact</strong>
          <strong>Purchases</strong>
          <strong>Outstanding</strong>
          <strong>Status</strong>
          {rows.map((row) => (
            <div className="data-row" key={row.id}>
              <Link href={`/suppliers/${row.id}`}>
                <b>{row.name}</b>
              </Link>
              <span>{row.contactName ?? row.phone ?? "—"}</span>
              <span>{formatMinorCurrency(row.totalPurchasesMinor)}</span>
              <b>{formatMinorCurrency(row.outstandingMinor)}</b>
              <span className={`pill ${row.isActive ? "active" : ""}`}>
                {row.isActive ? "Active" : "Inactive"}
              </span>
            </div>
          ))}
        </div>
        {!rows.length && !message && (
          <p className="empty muted">No suppliers found.</p>
        )}
      </section>
    </AppShell>
  );
}
