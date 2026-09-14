"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import { Can } from "../components/permission-context";
import { api, selectedOrganization } from "../lib/api";
import { formatMinorCurrency } from "../lib/catalogue";
import type { Customer, Paged } from "../lib/phase4";

export default function CustomersPage() {
  const organizationId = selectedOrganization();
  const [rows, setRows] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!organizationId) return;
    const timer = window.setTimeout(
      () =>
        void api<Paged<Customer>>(
          `/organizations/${organizationId}/customers?pageSize=100&search=${encodeURIComponent(search)}`,
        )
          .then((value) => setRows(value.items))
          .catch((error) => setMessage(error.message)),
      200,
    );
    return () => window.clearTimeout(timer);
  }, [organizationId, search]);
  return (
    <AppShell title="Customers">
      <section className="card">
        <div className="toolbar">
          <input
            aria-label="Search customers"
            placeholder="Search name, phone or email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Can permissions={["customer.create"]}>
            <Link className="button-link" href="/customers/new">
              New customer
            </Link>
          </Can>
        </div>
        {message && <p className="error">{message}</p>}
        <div className="data-table customer-table">
          <strong>Customer</strong>
          <strong>Contact</strong>
          <strong>Purchases</strong>
          <strong>Balance</strong>
          <strong>Credit limit</strong>
          <strong>Status</strong>
          {rows.map((row) => (
            <div className="data-row" key={row.id}>
              <Link href={`/customers/${row.id}`}>
                <b>{row.name}</b>
              </Link>
              <span>{row.phone ?? row.email ?? "—"}</span>
              <span>{formatMinorCurrency(row.totalPurchasesMinor)}</span>
              <b>
                {row.balanceMinor === undefined
                  ? "Restricted"
                  : formatMinorCurrency(row.balanceMinor)}
              </b>
              <span>
                {row.creditLimitMinor === undefined
                  ? "Restricted"
                  : row.creditLimitMinor === null
                    ? "None"
                    : formatMinorCurrency(row.creditLimitMinor)}
              </span>
              <span className={`pill ${row.isActive ? "active" : ""}`}>
                {row.isActive ? "Active" : "Inactive"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
