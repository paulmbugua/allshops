"use client";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../components/app-shell";
import { api, selectedOrganization } from "../lib/api";
import {
  decimalCurrencyToMinor,
  formatMinorCurrency,
  type Paged as CataloguePaged,
  type Product,
} from "../lib/catalogue";
import type { CommissionRule, Paged, Staff } from "../lib/phase5";

export default function CommissionRulesPage() {
  const organizationId = selectedOrganization();
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<Product[]>([]);
  const [message, setMessage] = useState("");
  async function load() {
    if (!organizationId) return;
    try {
      const [ruleRows, staffRows, products] = await Promise.all([
        api<Paged<CommissionRule>>(
          `/organizations/${organizationId}/commission-rules?pageSize=100`,
        ),
        api<Paged<Staff>>(
          `/organizations/${organizationId}/staff?pageSize=100&isActive=true`,
        ),
        api<CataloguePaged<Product>>(
          `/organizations/${organizationId}/products?pageSize=100&type=SERVICE`,
        ),
      ]);
      setRules(ruleRows.items);
      setStaff(staffRows.items);
      setServices(products.items);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load rules.",
      );
    }
  }
  useEffect(() => {
    void load();
  }, [organizationId]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const data = new FormData(event.currentTarget);
    const type = String(data.get("type"));
    const value = String(data.get("value"));
    try {
      await api(`/organizations/${organizationId}/commission-rules`, {
        method: "POST",
        body: JSON.stringify({
          staffProfileId: data.get("staffProfileId"),
          serviceProductId: data.get("serviceProductId") || null,
          type,
          ...(type === "PERCENTAGE"
            ? { basisPoints: Math.round(Number(value) * 100) }
            : { valueMinor: decimalCurrencyToMinor(value) }),
        }),
      });
      event.currentTarget.reset();
      setMessage("Commission rule created.");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create rule.",
      );
    }
  }
  return (
    <AppShell title="Commission rules">
      <div className="two-column">
        <section className="card">
          <h2>Rules</h2>
          {message && <p className="notice">{message}</p>}
          <div className="data-table">
            <strong>Staff</strong>
            <strong>Service</strong>
            <strong>Rule</strong>
            <strong>Status</strong>
            {rules.map((row) => (
              <div className="data-row" key={row.id}>
                <span>{row.staffProfile.displayName}</span>
                <span>{row.serviceProduct?.name ?? "All services"}</span>
                <b>
                  {row.type === "PERCENTAGE"
                    ? `${(row.basisPoints ?? 0) / 100}%`
                    : formatMinorCurrency(row.valueMinor ?? 0)}
                </b>
                <span>{row.isActive ? "Active" : "Inactive"}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <h2>New rule</h2>
          <form className="stack" onSubmit={create}>
            <label>
              Staff
              <select required name="staffProfileId">
                <option value="">Select staff</option>
                {staff.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Service
              <select name="serviceProductId">
                <option value="">All services (default)</option>
                {services.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select name="type">
                <option value="PERCENTAGE">Percentage</option>
                <option value="FIXED">Fixed QAR</option>
              </select>
            </label>
            <label>
              Value
              <input required name="value" type="number" min="0" step="0.01" />
            </label>
            <button>Create rule</button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
