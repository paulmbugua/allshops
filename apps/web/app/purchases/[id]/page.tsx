"use client";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../../components/app-shell";
import { Can } from "../../components/permission-context";
import { api, selectedOrganization } from "../../lib/api";
import { formatMinorCurrency } from "../../lib/catalogue";
import {
  moneyInputToMinor,
  type Location,
  type Purchase,
} from "../../lib/phase4";

export default function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const organizationId = selectedOrganization();
  const [purchase, setPurchase] = useState<Purchase>();
  const [locations, setLocations] = useState<Location[]>([]);
  const [message, setMessage] = useState("");
  const load = () =>
    organizationId &&
    api<Purchase>(`/organizations/${organizationId}/purchases/${id}`)
      .then((value) => {
        setPurchase(value);
        return api<Location[]>(
          `/organizations/${organizationId}/stock-locations?branchId=${value.branch.id}`,
        );
      })
      .then(setLocations)
      .catch((error) => setMessage(error.message));
  useEffect(() => {
    void load();
  }, [organizationId, id]);
  async function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || !purchase) return;
    const form = new FormData(event.currentTarget);
    const items = purchase
      .items!.map((row) => ({
        purchaseItemId: row.id,
        quantity: String(form.get(`qty-${row.id}`) ?? "0"),
      }))
      .filter((row) => Number(row.quantity) > 0);
    try {
      await api(`/organizations/${organizationId}/purchases/${id}/receive`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ locationId: form.get("locationId"), items }),
      });
      setMessage("Stock received.");
      void load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Receiving failed.");
    }
  }
  async function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || !purchase) return;
    const form = new FormData(event.currentTarget);
    try {
      await api(
        `/organizations/${organizationId}/suppliers/${purchase.supplier.id}/payments`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({
            purchaseId: id,
            amountMinor: moneyInputToMinor(String(form.get("amount"))),
            method: form.get("method"),
            reference: String(form.get("reference") ?? "") || null,
            paidAt: form.get("paidAt"),
          }),
        },
      );
      setMessage("Supplier payment recorded.");
      event.currentTarget.reset();
      void load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment failed.");
    }
  }
  async function cancel() {
    if (!organizationId || !window.confirm("Cancel this draft purchase?"))
      return;
    try {
      await api(`/organizations/${organizationId}/purchases/${id}/cancel`, {
        method: "POST",
      });
      void load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cancel failed.");
    }
  }
  if (!purchase)
    return (
      <AppShell title="Purchase">
        <section className="card">
          <p>{message || "Loading…"}</p>
        </section>
      </AppShell>
    );
  return (
    <AppShell title={purchase.purchaseNumber}>
      <section className="card">
        <div className="sale-heading">
          <div>
            <b>{purchase.supplier.name}</b>
            <p className="muted">
              {purchase.branch.name} ·{" "}
              {new Date(purchase.purchaseDate).toLocaleDateString()}
            </p>
          </div>
          <span className="pill">{purchase.status}</span>
        </div>
        <div className="context-grid">
          <div>
            <small>Total</small>
            <strong>{formatMinorCurrency(purchase.totalMinor)}</strong>
          </div>
          <div>
            <small>Paid</small>
            <strong>{formatMinorCurrency(purchase.paidMinor)}</strong>
          </div>
          <div>
            <small>Balance</small>
            <strong>{formatMinorCurrency(purchase.balanceMinor)}</strong>
          </div>
        </div>
        <h2>Items</h2>
        <div className="data-table purchase-items-table">
          <strong>Item</strong>
          <strong>Ordered</strong>
          <strong>Received</strong>
          <strong>Remaining</strong>
          <strong>Unit cost</strong>
          <strong>Total</strong>
          {purchase.items?.map((row) => (
            <div className="data-row" key={row.id}>
              <span>
                {row.productNameSnapshot}
                {row.variantNameSnapshot && ` · ${row.variantNameSnapshot}`}
              </span>
              <span>{row.quantity}</span>
              <span>{row.receivedQuantity}</span>
              <strong>
                {Number(row.quantity) - Number(row.receivedQuantity)}
              </strong>
              <span>{formatMinorCurrency(row.unitCostMinor)}</span>
              <b>{formatMinorCurrency(row.totalMinor)}</b>
            </div>
          ))}
        </div>
        {["DRAFT", "PARTIALLY_RECEIVED"].includes(purchase.status) && (
          <Can permissions={["purchase.receive"]}>
            <form className="form compact" onSubmit={receive}>
              <h2>Receive stock</h2>
              <label>
                Destination
                <select name="locationId" required>
                  <option value="">Select location</option>
                  {locations.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
              {purchase.items?.map((row) => (
                <label key={row.id}>
                  {row.productNameSnapshot} (remaining{" "}
                  {Number(row.quantity) - Number(row.receivedQuantity)})
                  <input name={`qty-${row.id}`} defaultValue="0" />
                </label>
              ))}
              <button>Receive selected quantities</button>
            </form>
          </Can>
        )}
        {purchase.balanceMinor > 0 && purchase.status !== "CANCELLED" && (
          <Can permissions={["supplier_payment.create"]}>
            <form className="form compact" onSubmit={pay}>
              <h2>Record supplier payment</h2>
              <div className="form-grid">
                <label>
                  Amount QAR
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    max={(purchase.balanceMinor / 100).toFixed(2)}
                    step="0.01"
                    required
                  />
                </label>
                <label>
                  Method
                  <select name="method">
                    <option>CASH</option>
                    <option>CARD</option>
                    <option>BANK_TRANSFER</option>
                    <option>QR</option>
                    <option>OTHER</option>
                  </select>
                </label>
                <label>
                  Reference
                  <input name="reference" />
                </label>
                <label>
                  Payment date
                  <input
                    name="paidAt"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                  />
                </label>
              </div>
              <button>Record payment</button>
            </form>
          </Can>
        )}
        {purchase.status === "DRAFT" && (
          <Can permissions={["purchase.cancel_draft"]}>
            <div className="actions">
              <button className="danger" onClick={() => void cancel()}>
                Cancel draft
              </button>
            </div>
          </Can>
        )}
        {message && <p className="notice">{message}</p>}
      </section>
    </AppShell>
  );
}
