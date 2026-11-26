"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../lib/api";
import styles from "../platform.module.css";

const statuses = ["OPEN", "TRIAGED", "IN_PROGRESS", "RESOLVED", "CLOSED"];
type Issue = {
  id: string;
  title: string;
  status: string;
  severity: string;
  category: string;
  createdAt: string;
  organization: { name: string };
};
type Detail = Issue & {
  description: string;
  updatedAt: string;
  requestId: string | null;
  invoiceNumber: string | null;
  localReference: string | null;
  resolutionNote: string | null;
  reporter: { name: string; email: string };
  organization: {
    name: string;
    subscription: { id: string; status: string } | null;
  };
};

export default function PlatformSupport() {
  const [issues, setIssues] = useState<Issue[]>();
  const [detail, setDetail] = useState<Detail>();
  const [filters, setFilters] = useState({ search: "", status: "", page: 1 });
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ page: String(filters.page) });
    if (filters.search) params.set("search", filters.search);
    if (filters.status) params.set("status", filters.status);
    void api<Issue[]>("/platform/support/issues?" + params)
      .then((rows) => {
        if (active) setIssues(rows);
      })
      .catch((cause: Error) => {
        if (active) {
          setError(true);
          setMessage(cause.message);
        }
      });
    return () => {
      active = false;
    };
  }, [filters, revision]);

  async function open(id: string) {
    setBusy(true);
    setMessage("");
    try {
      setDetail(await api<Detail>("/platform/support/issues/" + id));
    } catch (cause) {
      setError(true);
      setMessage(
        cause instanceof Error ? cause.message : "Unable to open the request.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      await api("/platform/support/issues/" + detail.id, {
        method: "PATCH",
        body: JSON.stringify({
          status: form.get("status"),
          resolutionNote: form.get("resolutionNote"),
          updatedAt: detail.updatedAt,
        }),
      });
      setDetail(await api<Detail>("/platform/support/issues/" + detail.id));
      setRevision((value) => value + 1);
      setError(false);
      setMessage("Support update saved and visible to the workspace.");
    } catch (cause) {
      setError(true);
      setMessage(
        cause instanceof Error ? cause.message : "Unable to save the update.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.main}>
      <h1>Support requests</h1>
      {message && (
        <p
          className={error ? "error" : "notice"}
          role={error ? "alert" : "status"}
        >
          {message}
        </p>
      )}
      {detail && (
        <section className="card" aria-labelledby="support-detail">
          <h2 id="support-detail">{detail.title}</h2>
          <p>
            {detail.organization.name} · {detail.reporter.name} ·{" "}
            {detail.reporter.email}
          </p>
          <p className={styles.preserve}>{detail.description}</p>
          <p>
            {detail.category.replaceAll("_", " ")} · {detail.severity}
          </p>
          {detail.invoiceNumber && <p>Invoice {detail.invoiceNumber}</p>}
          {detail.localReference && <p>Reference {detail.localReference}</p>}
          {detail.requestId && <p>Request ID {detail.requestId}</p>}
          {detail.organization.subscription && (
            <p>
              <Link
                href={
                  "/platform/subscriptions/" +
                  detail.organization.subscription.id
                }
              >
                Open subscription ({detail.organization.subscription.status})
              </Link>
            </p>
          )}
          <form
            className="form"
            key={detail.id + detail.updatedAt}
            onSubmit={save}
          >
            <label>
              Status
              <select name="status" defaultValue={detail.status}>
                {statuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <label>
              Update for the customer
              <textarea
                name="resolutionNote"
                minLength={3}
                maxLength={5000}
                rows={4}
                required
                defaultValue={detail.resolutionNote ?? ""}
              />
            </label>
            <div className="actions">
              <button disabled={busy}>Save support update</button>
              <button
                className="secondary"
                disabled={busy}
                type="button"
                onClick={() => void open(detail.id)}
              >
                Reload request
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => setDetail(undefined)}
              >
                Back to queue
              </button>
            </div>
          </form>
        </section>
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
            Search requests
            <input
              name="search"
              maxLength={120}
              placeholder="Title, workspace, or request ID"
            />
          </label>
          <label>
            Status
            <select name="status">
              <option value="">All statuses</option>
              {statuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <button>Apply filters</button>
        </form>
        {!issues && !message && <p role="status">Loading requests…</p>}
        {issues?.length === 0 && <p>No requests match these filters.</p>}
        {issues?.map((issue) => (
          <div className={styles.row} key={issue.id}>
            <strong>
              {issue.title}
              <br />
              <small>{issue.organization.name}</small>
            </strong>
            <span>{issue.status.replaceAll("_", " ")}</span>
            <span>
              {issue.severity} ·{" "}
              {new Date(issue.createdAt).toLocaleDateString()}
            </span>
            <button
              disabled={busy}
              className="secondary"
              onClick={() => void open(issue.id)}
            >
              Review
            </button>
          </div>
        ))}
        <div className="actions">
          <button
            className="secondary"
            disabled={filters.page <= 1}
            onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
          >
            Previous
          </button>
          <span>Page {filters.page}</span>
          <button
            className="secondary"
            disabled={issues?.length !== 40}
            onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
          >
            Next
          </button>
        </div>
      </section>
    </main>
  );
}
