"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../../components/app-shell";
import { Can } from "../../components/permission-context";
import { api, selectedOrganization } from "../../lib/api";
import { formatMinorCurrency } from "../../lib/catalogue";
import type { Supplier } from "../../lib/phase4";

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const organizationId = selectedOrganization();
  const [supplier, setSupplier] = useState<Supplier>();
  const [message, setMessage] = useState("");
  const load = () =>
    organizationId &&
    api<Supplier>(`/organizations/${organizationId}/suppliers/${id}`)
      .then(setSupplier)
      .catch((error) => setMessage(error.message));
  useEffect(() => {
    void load();
  }, [organizationId, id]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const form = new FormData(event.currentTarget);
    try {
      await api(`/organizations/${organizationId}/suppliers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.get("name"),
          contactName: String(form.get("contactName") ?? "") || null,
          phone: String(form.get("phone") ?? "") || null,
          isActive: form.get("isActive") === "on",
        }),
      });
      setMessage("Supplier updated.");
      void load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed.");
    }
  }
  if (!supplier)
    return (
      <AppShell title="Supplier">
        <section className="card">
          <p>{message || "Loading…"}</p>
        </section>
      </AppShell>
    );
  return (
    <AppShell title={supplier.name}>
      <section className="card">
        <div className="context-grid">
          <div>
            <small>Total purchases</small>
            <strong>{formatMinorCurrency(supplier.totalPurchasesMinor)}</strong>
          </div>
          <div>
            <small>Outstanding</small>
            <strong>{formatMinorCurrency(supplier.outstandingMinor)}</strong>
          </div>
          <div>
            <small>Contact</small>
            <strong>{supplier.phone ?? supplier.email ?? "—"}</strong>
          </div>
        </div>
        <Can permissions={["supplier.update"]}>
          <form className="form compact" onSubmit={save}>
            <div className="form-grid">
              <label>
                Name
                <input name="name" defaultValue={supplier.name} required />
              </label>
              <label>
                Contact
                <input
                  name="contactName"
                  defaultValue={supplier.contactName ?? ""}
                />
              </label>
              <label>
                Phone
                <input name="phone" defaultValue={supplier.phone ?? ""} />
              </label>
              <label className="check-row">
                <input
                  name="isActive"
                  type="checkbox"
                  defaultChecked={supplier.isActive}
                />{" "}
                Active
              </label>
            </div>
            <button>Save profile</button>
          </form>
        </Can>
        <h2>Purchases</h2>
        <div className="table-list">
          {supplier.purchases?.map((row) => (
            <div className="table-row" key={row.id}>
              <Link href={`/purchases/${row.id}`}>{row.purchaseNumber}</Link>
              <span>{row.status}</span>
              <b>{formatMinorCurrency(row.balanceMinor)}</b>
            </div>
          ))}
        </div>
        <h2>Payments</h2>
        <div className="table-list">
          {supplier.payments?.map((row) => (
            <div className="table-row" key={row.id}>
              <span>
                {new Date(row.paidAt).toLocaleDateString()} · {row.method}
              </span>
              <span>{row.reference ?? "—"}</span>
              <b>{formatMinorCurrency(row.amountMinor)}</b>
            </div>
          ))}
        </div>
        {message && <p className="notice">{message}</p>}
      </section>
    </AppShell>
  );
}
