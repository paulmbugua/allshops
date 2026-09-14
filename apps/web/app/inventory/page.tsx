"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import { Can } from "../components/permission-context";
import { api, selectedOrganization } from "../lib/api";
import type { Branch, InventoryRow, Location, Paged } from "../lib/catalogue";
export default function InventoryPage() {
  const [rows, setRows] = useState<Paged<InventoryRow>>({
    items: [],
    page: 1,
    pageSize: 25,
    total: 0,
  });
  const [branches, setBranches] = useState<Branch[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [branchId, setBranchId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [lowStock, setLowStock] = useState("");
  const [message, setMessage] = useState("");
  const organizationId = selectedOrganization();
  useEffect(() => {
    if (!organizationId) {
      window.location.assign("/onboarding");
      return;
    }
    void Promise.all([
      api<Branch[]>(`/organizations/${organizationId}/branches`),
      api<Location[]>(`/organizations/${organizationId}/stock-locations`),
    ])
      .then(([branchRows, locationRows]) => {
        setBranches(branchRows);
        setLocations(locationRows);
      })
      .catch((error) =>
        setMessage(
          error instanceof Error ? error.message : "Unable to load locations.",
        ),
      );
    void load();
  }, [organizationId]);
  async function load(page = 1) {
    if (!organizationId) return;
    try {
      setRows(
        await api<Paged<InventoryRow>>(
          `/organizations/${organizationId}/inventory?page=${page}&pageSize=25${branchId ? `&branchId=${branchId}` : ""}${locationId ? `&locationId=${locationId}` : ""}${lowStock ? `&lowStock=${lowStock}` : ""}`,
        ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load inventory.",
      );
    }
  }
  return (
    <AppShell title="Inventory">
      <section className="card">
        <div className="toolbar">
          <div className="filters">
            <select
              aria-label="Branch"
              value={branchId}
              onChange={(event) => {
                setBranchId(event.target.value);
                setLocationId("");
              }}
            >
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Location"
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
            >
              <option value="">All locations</option>
              {locations
                .filter(
                  (location) => !branchId || location.branchId === branchId,
                )
                .map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.branch.name} · {location.name}
                  </option>
                ))}
            </select>
            <select
              aria-label="Stock status"
              value={lowStock}
              onChange={(event) => setLowStock(event.target.value)}
            >
              <option value="">All stock</option>
              <option value="true">Low stock</option>
              <option value="false">Healthy stock</option>
            </select>
            <button onClick={() => void load()}>Apply</button>
          </div>
          <Can permissions={["inventory.adjust"]}>
            <Link className="button-link" href="/inventory/adjustments/new">
              Post stock
            </Link>
          </Can>
        </div>
        <div className="data-table inventory-table">
          <strong>Product</strong>
          <strong>SKU / Variant</strong>
          <strong>Branch</strong>
          <strong>Location</strong>
          <strong>Current stock</strong>
          <strong>Minimum</strong>
          <strong>Status</strong>
          {rows.items.map((row) => (
            <div className="data-row" key={row.id}>
              <span>
                <strong>{row.product.name}</strong>
              </span>
              <span>
                {row.variant?.sku ?? row.product.sku ?? "—"}
                <small>{row.variant?.name ?? "Base product"}</small>
              </span>
              <span>{row.branch.name}</span>
              <span>{row.location.name}</span>
              <strong>{row.quantity}</strong>
              <span>{row.product.minimumStock ?? "—"}</span>
              <span className={`pill ${row.lowStock ? "warning" : "active"}`}>
                {row.lowStock ? "Low stock" : "In stock"}
              </span>
            </div>
          ))}
        </div>
        {rows.items.length === 0 && (
          <p className="muted empty">No stock balances match these filters.</p>
        )}
        {message && <p className="notice">{message}</p>}
      </section>
    </AppShell>
  );
}
