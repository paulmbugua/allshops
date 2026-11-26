"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import styles from "../platform.module.css";

type Subscription = {
  id: string;
  status: string;
  organization: { name: string };
  plan: { name: string };
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
};
const statuses = [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "GRACE_PERIOD",
  "SUSPENDED",
  "CANCELLED",
  "EXPIRED",
];
export default function PlatformSubscriptionsPage() {
  const [rows, setRows] = useState<Subscription[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(() => ({
    search: "",
    status:
      typeof window === "undefined"
        ? ""
        : (new URLSearchParams(window.location.search).get("status") ?? ""),
    page: 1,
  }));
  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({
      page: String(filters.page),
      pageSize: "25",
    });
    if (filters.search) params.set("search", filters.search);
    if (statuses.includes(filters.status)) params.set("status", filters.status);
    void api<Subscription[]>("/platform/subscriptions?" + params)
      .then((data) => {
        if (active) setRows(data);
      })
      .catch((error: Error) => {
        if (active) setMessage(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filters]);
  return (
    <main className={styles.main}>
      <h1>Merchant subscriptions</h1>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      <section className="card">
        <form
          className={styles.filters}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setFilters({
              search: String(data.get("search")),
              status: String(data.get("status")),
              page: 1,
            });
          }}
        >
          <label>
            Workspace name
            <input name="search" maxLength={120} />
          </label>
          <label>
            Status
            <select name="status" defaultValue={filters.status}>
              <option value="">All statuses</option>
              {statuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <button>Apply filters</button>
        </form>
        {loading && <p role="status">Loading subscriptions…</p>}
        {!loading && !message && rows.length === 0 && (
          <p>No subscriptions match these filters.</p>
        )}
        {!loading &&
          !message &&
          rows.map((row) => (
            <Link
              className={styles.row}
              href={`/platform/subscriptions/${row.id}`}
              key={row.id}
            >
              <strong>{row.organization.name}</strong>
              <span>{row.plan.name}</span>
              <span>{row.status}</span>
              <span>
                {row.currentPeriodEnd
                  ? "Paid until " +
                    new Date(row.currentPeriodEnd).toLocaleDateString()
                  : row.trialEndsAt
                    ? "Trial ends " +
                      new Date(row.trialEndsAt).toLocaleDateString()
                    : "No paid period"}
              </span>
            </Link>
          ))}
        <div className="actions">
          <button
            className="secondary"
            disabled={loading || filters.page <= 1}
            onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
          >
            Previous
          </button>
          <span>Page {filters.page}</span>
          <button
            className="secondary"
            disabled={loading || !!message || rows.length !== 25}
            onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
          >
            Next
          </button>
        </div>
      </section>
    </main>
  );
}
