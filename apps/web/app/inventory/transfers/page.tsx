"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { Can } from "../../components/permission-context";
import { api, selectedOrganization } from "../../lib/api";
import type { Paged } from "../../lib/catalogue";
interface Transfer {
  id: string;
  transferNumber: string;
  status: string;
  createdAt: string;
  fromBranch: { name: string };
  toBranch: { name: string };
  _count: { items: number };
}
export default function TransfersPage() {
  const [result, setResult] = useState<Paged<Transfer>>({
    items: [],
    page: 1,
    pageSize: 25,
    total: 0,
  });
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const organizationId = selectedOrganization();
  useEffect(() => {
    if (!organizationId) return;
    void load();
  }, [organizationId]);
  async function load() {
    if (!organizationId) return;
    try {
      setResult(
        await api<Paged<Transfer>>(
          `/organizations/${organizationId}/inventory/transfers?pageSize=50${status ? `&status=${status}` : ""}`,
        ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load transfers.",
      );
    }
  }
  return (
    <AppShell title="Stock transfers">
      <section className="card">
        <div className="toolbar">
          <div className="filters">
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All statuses</option>
              {["DRAFT", "SENT", "RECEIVED", "CANCELLED"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <button onClick={() => void load()}>Apply</button>
          </div>
          <Can permissions={["inventory.transfer"]}>
            <Link className="button-link" href="/inventory/transfers/new">
              New transfer
            </Link>
          </Can>
        </div>
        <div className="data-table transfer-table">
          <strong>Transfer</strong>
          <strong>Route</strong>
          <strong>Items</strong>
          <strong>Created</strong>
          <strong>Status</strong>
          {result.items.map((item) => (
            <div className="data-row" key={item.id}>
              <Link href={`/inventory/transfers/${item.id}`}>
                <strong>{item.transferNumber}</strong>
              </Link>
              <span>
                {item.fromBranch.name} → {item.toBranch.name}
              </span>
              <span>{item._count.items}</span>
              <span>
                {new Intl.DateTimeFormat("en-QA", {
                  dateStyle: "medium",
                }).format(new Date(item.createdAt))}
              </span>
              <span
                className={`pill ${item.status === "RECEIVED" ? "active" : ""}`}
              >
                {item.status}
              </span>
            </div>
          ))}
        </div>
        {message && <p className="notice">{message}</p>}
      </section>
    </AppShell>
  );
}
