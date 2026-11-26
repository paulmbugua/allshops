"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, api, selectedOrganization } from "../lib/api";
import type { Category, Paged } from "../lib/catalogue";
import { Can } from "./permission-context";

type Resource = Category & { symbol?: string; description?: string | null };
const descriptionPresets = {
  categories: [
    "Food and groceries",
    "Drinks and beverages",
    "Household and cleaning supplies",
    "Personal care and hygiene",
    "General merchandise",
  ],
  brands: [
    "Food and beverage brand",
    "Household and cleaning brand",
    "Personal care brand",
    "Store brand",
    "General merchandise brand",
  ],
};

export function ReferenceManager({
  kind,
}: {
  kind: "categories" | "brands" | "units";
}) {
  const [items, setItems] = useState<Resource[]>([]);
  const [message, setMessage] = useState("");
  const [billingBlocked, setBillingBlocked] = useState(false);
  const [description, setDescription] = useState("");
  const organizationId = selectedOrganization();
  const singular = kind === "categories" ? "category" : kind.slice(0, -1);
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
    setBillingBlocked(false);
    const data = new FormData(form);
    const descriptionText =
      description === "other"
        ? String(data.get("customDescription") ?? "").trim()
        : description;
    if (kind !== "units" && description === "other" && !descriptionText) {
      setMessage("Enter a custom description.");
      return;
    }
    const body =
      kind === "units"
        ? { name: data.get("name"), symbol: data.get("symbol") }
        : kind === "categories"
          ? {
              name: data.get("name"),
              parentId: data.get("parentId") || null,
              arabicName: data.get("arabicName") || null,
              description: descriptionText || null,
            }
          : {
              name: data.get("name"),
              description: descriptionText || null,
            };
    try {
      await api(`/organizations/${organizationId}/${kind}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      form.reset();
      setDescription("");
      setMessage(`${singular} created.`);
      await load();
    } catch (error) {
      if (
        error instanceof ApiError &&
        [
          "SUBSCRIPTION_REQUIRED",
          "SUBSCRIPTION_INACTIVE",
          "SUBSCRIPTION_SUSPENDED",
        ].includes(error.code)
      ) {
        setBillingBlocked(true);
      }
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
      <Can permissions={[`${singular}.create`]}>
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
                  Local / Kiswahili name
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
              <>
                <label>
                  Description
                  <select
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  >
                    <option value="">No description</option>
                    {descriptionPresets[kind].map((preset) => (
                      <option key={preset}>{preset}</option>
                    ))}
                    <option value="other">Other (custom description)</option>
                  </select>
                </label>
                {description === "other" && (
                  <label>
                    Custom description
                    <input name="customDescription" required maxLength={500} />
                  </label>
                )}
              </>
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
            <Can permissions={[`${singular}.update`]}>
              <button className="secondary" onClick={() => void toggle(item)}>
                {item.isActive ? "Deactivate" : "Activate"}
              </button>
            </Can>
          </div>
        ))}
      </div>
      {message && <p className="notice">{message}</p>}
      {billingBlocked && (
        <p className="notice" role="alert">
          This workspace needs an active subscription or trial.{" "}
          <Link href="/settings/subscription">View subscription</Link> or{" "}
          <Link href="/support/requests">contact support</Link>.
        </p>
      )}
    </section>
  );
}
