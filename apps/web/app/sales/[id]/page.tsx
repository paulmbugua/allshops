"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { Can } from "../../components/permission-context";
import { api, selectedOrganization } from "../../lib/api";
import { formatMinorCurrency } from "../../lib/catalogue";
import type { Sale } from "../../lib/sales";
export default function SalePage() {
  const { id } = useParams<{ id: string }>();
  const organizationId = selectedOrganization();
  const [sale, setSale] = useState<Sale>();
  const [tenderMode, setTenderMode] = useState<"CASH" | "LOCAL_CARD">("CASH");
  const [cashTender, setCashTender] = useState("");
  const [localBank, setLocalBank] = useState("QNB");
  const [terminalReference, setTerminalReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [refundKind, setRefundKind] = useState<"REFUND" | "RETURN" | "EXCHANGE">("REFUND");
  const [refundReason, setRefundReason] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);
  const [replacementSaleId, setReplacementSaleId] = useState("");
  async function load() {
    if (!organizationId) return;
    try {
      setSale(await api<Sale>(`/organizations/${organizationId}/sales/${id}`));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load sale.",
      );
    }
  }
  useEffect(() => {
    if (!organizationId) {
      window.location.assign("/onboarding");
      return;
    }
    void load();
  }, [organizationId, id]);
  async function complete() {
    if (!organizationId || !sale) return;
    setBusy(true);
    try {
      const cashMinor = cashTender
        ? Math.round(Number(cashTender) * 100)
        : sale.totalMinor;
      if (tenderMode === "CASH" && cashMinor < sale.totalMinor)
        throw new Error("Cash received cannot be less than the sale total.");
      const updated = await api<Sale>(
        `/organizations/${organizationId}/sales/${id}/complete`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({
            payments: [
              tenderMode === "CASH"
                ? { method: "CASH", amountMinor: cashMinor }
                : {
                    method: "CARD",
                    amountMinor: sale.totalMinor,
                    reference: `LOCAL:${localBank}:${terminalReference.trim() || "NO-REFERENCE"}`,
                  },
            ],
          }),
        },
      );
      setSale(updated);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to complete held sale.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!organizationId || !window.confirm("Cancel this held sale?")) return;
    setBusy(true);
    try {
      setSale(
        await api<Sale>(`/organizations/${organizationId}/sales/${id}/cancel`, {
          method: "POST",
        }),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to cancel sale.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function refund() {
    if (!organizationId || !sale || !refundReason.trim()) return;
    setRefundBusy(true);
    try {
      await api(`/organizations/${organizationId}/sales/${sale.id}/refund`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ kind: refundKind, replacementSaleId: refundKind === "EXCHANGE" ? replacementSaleId : null, amountMinor: sale.totalMinor, method: sale.payments.find((payment) => payment.method === "CASH")?.method ?? "CARD", reason: refundReason, items: sale.items.map((item) => ({ saleItemId: item.id, quantity: item.quantity, amountMinor: item.totalMinor })) }) });
      setRefundReason(""); setMessage(`${refundKind[0]}${refundKind.slice(1).toLowerCase()} completed and stock reversal recorded.`); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to process refund."); } finally { setRefundBusy(false); }
  }
  return (
    <AppShell title={sale?.invoiceNumber ?? "Held sale"}>
      <section className="card">
        {!sale ? (
          <p>{message || "Loading…"}</p>
        ) : (
          <>
            <div className="sale-heading">
              <div>
                <span className="eyebrow">{sale.status}</span>
                <h2>{sale.invoiceNumber ?? `Held ${sale.id.slice(0, 8)}`}</h2>
                <p>
                  {sale.branch.name} · {sale.creator.name} ·{" "}
                  {new Date(sale.createdAt).toLocaleString("en-QA")}
                </p>
                {sale.customerName && <p>Customer: {sale.customerName}</p>}
              </div>
              {sale.status === "COMPLETED" && (
                <Can permissions={["receipt.print"]}>
                  <Link
                    className="button-link"
                    href={`/sales/${sale.id}/receipt`}
                  >
                    Print receipt
                  </Link>
                </Can>
              )}
            </div>
            <div className="data-table sale-items-table">
              <strong>Item</strong>
              <strong>SKU</strong>
              <strong>Quantity</strong>
              <strong>Unit price</strong>
              <strong>Total</strong>
              {sale.items.map((item) => (
                <div className="data-row" key={item.id}>
                  <span>
                    <strong>{item.productNameSnapshot}</strong>
                    <small>{item.variantNameSnapshot ?? ""}</small>
                  </span>
                  <span>{item.skuSnapshot ?? "—"}</span>
                  <span>{item.quantity}</span>
                  <span>{formatMinorCurrency(item.unitPriceMinor)}</span>
                  <strong>{formatMinorCurrency(item.totalMinor)}</strong>
                </div>
              ))}
            </div>
            <div className="totals detail-totals">
              <span>
                Subtotal <b>{formatMinorCurrency(sale.subtotalMinor)}</b>
              </span>
              <span>
                Discount <b>− {formatMinorCurrency(sale.discountMinor)}</b>
              </span>
              <span>
                Tax <b>{formatMinorCurrency(sale.taxMinor)}</b>
              </span>
              <strong>
                Total <b>{formatMinorCurrency(sale.totalMinor)}</b>
              </strong>
              {sale.balanceMinor > 0 && (
                <strong>
                  Balance due <b>{formatMinorCurrency(sale.balanceMinor)}</b>
                </strong>
              )}
            </div>
            {sale.status === "HELD" && (
              <div className="held-actions">
                <p className="muted">
                  Stock was not reserved. Current prices and availability will
                  be checked again.
                </p>
                <div className="payment-row">
                  <select
                    value={tenderMode}
                    onChange={(event) =>
                      setTenderMode(event.target.value as "CASH" | "LOCAL_CARD")
                    }
                  >
                    <option value="CASH">Cash</option>
                    <option value="LOCAL_CARD">Local bank card</option>
                  </select>
                  {tenderMode === "CASH" && (
                    <input
                      type="number"
                      min={sale.totalMinor / 100}
                      step="0.01"
                      placeholder={`Cash received (${formatMinorCurrency(sale.totalMinor)})`}
                      value={cashTender}
                      onChange={(event) => setCashTender(event.target.value)}
                    />
                  )}
                  {tenderMode === "LOCAL_CARD" && (
                    <>
                      <select
                        value={localBank}
                        onChange={(event) => setLocalBank(event.target.value)}
                      >
                        <option>QNB</option>
                        <option>Doha Bank</option>
                        <option>Commercial Bank</option>
                        <option>QIB</option>
                        <option>Dukhan Bank</option>
                        <option>Ahlibank</option>
                        <option>Other local terminal</option>
                      </select>
                      <input
                        placeholder="Terminal reference (optional)"
                        maxLength={80}
                        value={terminalReference}
                        onChange={(event) =>
                          setTerminalReference(event.target.value)
                        }
                      />
                    </>
                  )}
                  <Can permissions={["sale.create", "payment.record"]}>
                    <button disabled={busy} onClick={() => void complete()}>
                      {busy ? "Processing…" : "Complete payment"}
                    </button>
                  </Can>
                  <Can permissions={["sale.cancel_draft"]}>
                    <button
                      className="danger"
                      disabled={busy}
                      onClick={() => void cancel()}
                    >
                      Cancel
                    </button>
                  </Can>
                </div>
              </div>
            )}
            {sale.status === "COMPLETED" && <Can permissions={["sale.refund"]}><section className="compact card"><h3>Refund, return or exchange</h3><p className="muted">Creates an immutable audit event and reverses tracked stock.</p><div className="payment-row"><select value={refundKind} onChange={(event) => setRefundKind(event.target.value as typeof refundKind)}><option value="REFUND">Refund</option><option value="RETURN">Return</option><option value="EXCHANGE">Exchange</option></select>{refundKind === "EXCHANGE" && <input placeholder="Replacement sale ID" value={replacementSaleId} onChange={(event) => setReplacementSaleId(event.target.value)} />}<input placeholder="Reason (required)" value={refundReason} onChange={(event) => setRefundReason(event.target.value)} /><button className="danger" disabled={refundBusy || !refundReason.trim() || (refundKind === "EXCHANGE" && !replacementSaleId.trim())} onClick={() => void refund()}>{refundBusy ? "Processing…" : `Process ${refundKind.toLowerCase()}`}</button></div>{sale.refunds?.length ? <small>{sale.refunds.length} prior adjustment(s) recorded.</small> : null}</section></Can>}
            {message && <p className="notice">{message}</p>}
          </>
        )}
      </section>
    </AppShell>
  );
}
