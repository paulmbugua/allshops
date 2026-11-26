"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../../components/app-shell";
import { api, selectedOrganization } from "../../lib/api";

type Request = {
  id: string;
  title: string;
  status: string;
  category: string;
  resolutionNote: string | null;
  createdAt: string;
};
const categories = [
  "SUBSCRIPTION",
  "LOGIN_ACCESS",
  "POS",
  "PAYMENT",
  "RECEIPT",
  "INVENTORY",
  "CUSTOMER",
  "PURCHASE",
  "REPORT",
  "OFFLINE_SYNC",
  "APPOINTMENT",
  "OTHER",
];

export default function SupportRequests() {
  const organizationId = selectedOrganization();
  const [requests, setRequests] = useState<Request[]>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const path = "/organizations/" + organizationId + "/support/issues";

  useEffect(() => {
    if (!organizationId) return;
    void api<Request[]>(path)
      .then(setRequests)
      .catch((cause: Error) => {
        setError(true);
        setMessage(cause.message);
      });
  }, [organizationId, path]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const target = event.currentTarget;
    const data = new FormData(target);
    setBusy(true);
    setMessage("");
    try {
      const created = await api<Request>(path, {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(data)),
      });
      setRequests((current) => [created, ...(current ?? [])]);
      target.reset();
      setError(false);
      setMessage("Your request was sent to AllShops support.");
    } catch (cause) {
      setError(true);
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Unable to submit your request.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Support requests">
      <section className="card">
        <h2>Contact AllShops support</h2>
        <form className="form" onSubmit={submit}>
          <label>
            Category
            <select name="category">
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Subject
            <input name="title" maxLength={200} required />
          </label>
          <label>
            What happened?
            <textarea name="description" rows={5} maxLength={10000} required />
          </label>
          <button disabled={busy || !organizationId}>
            {busy ? "Sending…" : "Send support request"}
          </button>
          {message && (
            <p
              className={error ? "error" : "notice"}
              role={error ? "alert" : "status"}
            >
              {message}
            </p>
          )}
        </form>
      </section>
      <section className="card">
        <h2>Requests and replies</h2>
        {!requests && !error && <p role="status">Loading requests…</p>}
        {requests?.length === 0 && <p>No support requests yet.</p>}
        {requests?.map((request) => (
          <article className="notice" key={request.id}>
            <strong>{request.title}</strong>
            <p>
              {request.status.replaceAll("_", " ")} ·{" "}
              {new Date(request.createdAt).toLocaleDateString()}
            </p>
            {request.resolutionNote && (
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {request.resolutionNote}
              </p>
            )}
          </article>
        ))}
      </section>
    </AppShell>
  );
}
