"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { api, selectedOrganization } from "../../lib/api";
import type { Paged } from "../../lib/catalogue";
interface Movement {
  id: string;
  movementType: string;
  quantity: string;
  reason?: string;
  occurredAt: string;
  product: { name: string; sku?: string };
  variant?: { name: string } | null;
  branch: { name: string };
  location: { name: string };
  creator: { name: string };
}
export default function MovementsPage() {
  const [result, setResult] = useState<Paged<Movement>>({
    items: [],
    page: 1,
    pageSize: 50,
    total: 0,
  });
  const [type, setType] = useState("");
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
        await api<Paged<Movement>>(
          `/organizations/${organizationId}/inventory/movements?pageSize=50${type ? `&movementType=${type}` : ""}`,
        ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load movements.",
      );
    }
  }
  return (
    <AppShell title="Stock movements">
      <section className="card">
        <div className="toolbar">
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">All movement types</option>
            {[
              "OPENING",
              "ADJUSTMENT_IN",
              "ADJUSTMENT_OUT",
              "TRANSFER_IN",
              "TRANSFER_OUT",
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <button onClick={() => void load()}>Apply</button>
        </div>
        <div className="data-table movement-table">
          <strong>Date</strong>
          <strong>Product</strong>
          <strong>Location</strong>
          <strong>Type</strong>
          <strong>Quantity</strong>
          <strong>Reason</strong>
          {result.items.map((item) => (
            <div className="data-row" key={item.id}>
              <span>
                {new Intl.DateTimeFormat("en-QA", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(item.occurredAt))}
              </span>
              <span>
                <strong>{item.product.name}</strong>
                <small>
                  {item.variant?.name ?? item.product.sku ?? "Base product"}
                </small>
              </span>
              <span>
                {item.branch.name} · {item.location.name}
              </span>
              <span>{item.movementType.replaceAll("_", " ")}</span>
              <strong
                className={
                  item.quantity.startsWith("-") ? "negative" : "positive"
                }
              >
                {item.quantity}
              </strong>
              <span>{item.reason ?? "—"}</span>
            </div>
          ))}
        </div>
        {message && <p className="notice">{message}</p>}
      </section>
    </AppShell>
  );
}
