"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api, selectedOrganization } from "../lib/api";
import type { Category, Paged } from "../lib/catalogue";
import { Can } from "./permission-context";

type Resource = Category & { symbol?: string; description?: string | null };
export function ReferenceManager({
  kind,
}: {
  kind: "categories" | "brands" | "units";
}) {
  const [items, setItems] = useState<Resource[]>([]);
  const [message, setMessage] = useState("");
  const organizationId = selectedOrganization();
  const singular = kind.slice(0, -1);
  const permissionPrefix =
    kind === "categories" ? "category" : kind.slice(0, -1);
  const title = kind[0]!.toUpperCase() + kind.slice(1);
  useEffect(() => {
    if (!organizationId) {
      window.location.assign("/onboarding");
      return;
    }
    void load();
  }, [organizationId]);
  async function load() {
    if (!organizationId) return;
    try {
      const result = await api<Paged<Resource>>(
        `/organizations/${organizationId}/${kind}?pageSize=100`,
      );
      setItems(result.items);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : `Unable to load ${kind}.`,
      );
    }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const body =
      kind === "units"
        ? { name: data.get("name"), symbol: data.get("symbol") }
        : kind === "categories"
          ? {
              name: data.get("name"),
              parentId: data.get("parentId") || null,
              arabicName: data.get("arabicName") || null,
              description: data.get("description") || null,
            }
          : {
              name: data.get("name"),
              description: data.get("description") || null,
            };
    try {
      await api(`/organizations/${organizationId}/${kind}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      form.reset();
      setMessage(`${singular} created.`);
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : `Unable to create ${singular}.`,
      );
    }
  }
  async function toggle(item: Resource) {
    if (!organizationId) return;
    try {
      await api(`/organizations/${organizationId}/${kind}/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update resource.",
      );
    }
  }
  return (
    <section className="card">
      <Can permissions={[`${permissionPrefix}.create`]}>
        <form className="form compact first" onSubmit={create}>
          <div className="form-grid">
            <label>
              Name
              <input name="name" required />
            </label>
            {kind === "units" && (
              <label>
                Symbol
                <input name="symbol" required />
              </label>
            )}
            {kind === "categories" && (
              <>
                <label>
                  Arabic name
                  <input name="arabicName" dir="auto" />
                </label>
                <label>
                  Parent
                  <select name="parentId">
                    <option value="">Top level</option>
                    {items
                      .filter((item) => item.isActive)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
              </>
            )}
            {kind !== "units" && (
              <label>
                Description
                <input name="description" />
              </label>
            )}
          </div>
          <button>Create {singular}</button>
        </form>
      </Can>
      <h2>{title}</h2>
      <div className="table-list">
        {items.map((item) => (
          <div className="table-row" key={item.id}>
            <div>
              <strong>{item.name}</strong>
              <small>{item.symbol ?? item.parent?.name ?? "Top level"}</small>
            </div>
            <span className={`pill ${item.isActive ? "active" : ""}`}>
              {item.isActive ? "Active" : "Inactive"}
            </span>
            <Can permissions={[`${permissionPrefix}.update`]}>
              <button className="secondary" onClick={() => void toggle(item)}>
                {item.isActive ? "Deactivate" : "Activate"}
              </button>
            </Can>
          </div>
        ))}
      </div>
      {message && <p className="notice">{message}</p>}
    </section>
  );
}
