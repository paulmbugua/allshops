"use client";

import { businessProfiles, orderStages } from "@allshops/contracts";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { api } from "../lib/api";
import { formatMinorCurrency } from "../lib/catalogue";
import type { Paged, Sale, SaleSummary } from "../lib/sales";
import { Can } from "./permission-context";

type Workflow = NonNullable<(typeof businessProfiles)[string]["workflow"]>;
const pageSize = 24;
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The register could not finish this action. Try again.";
const ticketNumber = (id: string) => id.slice(0, 8).toUpperCase();

function OrderDialog({
  title,
  children,
  onClose,
  busy,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="pos-order-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="pos-order-dialog-heading">
        <h2>{title}</h2>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={onClose}
        >
          Close
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function PlaceOrderDialog({
  workflow,
  total,
  currency,
  busy,
  error,
  onClose,
  onPlace,
}: {
  workflow: Workflow;
  total: number;
  currency: string;
  busy: boolean;
  error: string;
  onClose: () => void;
  onPlace: (details: {
    channel: string;
    reference: string;
    notes: string;
  }) => Promise<void>;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void onPlace({
      channel: String(form.get("channel")),
      reference: String(form.get("reference")),
      notes: String(form.get("notes")),
    });
  }
  return (
    <OrderDialog
      title={`Place ${workflow.ticket.toLowerCase()}`}
      onClose={onClose}
      busy={busy}
    >
      <form className="form" onSubmit={submit}>
        <p className="pos-order-money">
          {formatMinorCurrency(total, currency)}
        </p>
        <label>
          Order type
          <select name="channel">
            {workflow.channels.map((channel) => (
              <option key={channel}>{channel}</option>
            ))}
          </select>
        </label>
        <label>
          {workflow.reference}
          <input
            name="reference"
            placeholder={workflow.example}
            required
            maxLength={120}
            autoFocus
          />
        </label>
        <label>
          Instructions <small>(optional)</small>
          <textarea name="notes" rows={3} maxLength={1000} />
        </label>
        <p className="muted">
          The order enters the queue unpaid. Take payment after handover.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? "Placing order…" : "Place order"}
        </button>
      </form>
    </OrderDialog>
  );
}

export function PosOrderBoard({
  organizationId,
  branchId,
  title,
  onClose,
  onPaid,
}: {
  organizationId: string;
  branchId: string;
  title: string;
  onClose: () => void;
  onPaid: (sale: Sale) => void;
}) {
  const base = `/organizations/${organizationId}`;
  const [page, setPage] = useState(1);
  const [queue, setQueue] = useState<Paged<SaleSummary>>();
  const [selected, setSelected] = useState<Sale>();
  const [paid, setPaid] = useState<Sale>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [method, setMethod] = useState("CASH");
  const [cash, setCash] = useState("");
  const [reference, setReference] = useState("");
  const paymentAttempt = useRef<{ payload: string; key: string }>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const next = await api<Paged<SaleSummary>>(
          `${base}/pos/orders?branchId=${branchId}&page=${page}&pageSize=${pageSize}`,
          { signal, cache: "no-store" },
        );
        if (next.items.length === 0 && page > 1) setPage(page - 1);
        else setQueue(next);
      } catch (cause) {
        if (!signal?.aborted) setError(errorText(cause));
      }
    },
    [base, branchId, page],
  );

  useEffect(() => {
    const abort = new AbortController();
    void load(abort.signal);
    const timer = window.setInterval(() => void load(abort.signal), 12_000);
    return () => {
      abort.abort();
      window.clearInterval(timer);
    };
  }, [load]);

  async function act(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  function openOrder(id: string) {
    void act(async () => {
      const sale = await api<Sale>(`${base}/sales/${id}`, {
        cache: "no-store",
      });
      if (sale.status !== "HELD" || !sale.orderStage) {
        await load();
        throw new Error(
          "This order is no longer open. The queue has been refreshed.",
        );
      }
      setSelected(sale);
      setMethod("CASH");
      setCash("");
      setReference("");
    });
  }

  function advance() {
    if (!selected?.orderStage) return;
    void act(async () => {
      const updated = await api<Sale>(
        `${base}/pos/orders/${selected.id}/advance`,
        {
          method: "POST",
          body: JSON.stringify({ from: selected.orderStage }),
        },
      );
      setSelected(updated);
      await load();
    });
  }

  function cancel() {
    if (!selected || !window.confirm("Cancel this unpaid order?")) return;
    void act(async () => {
      await api(`${base}/sales/${selected.id}/cancel`, { method: "POST" });
      setSelected(undefined);
      await load();
    });
  }

  function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const total = selected.totalMinor;
    const tender =
      method === "CASH" && cash.trim() ? Math.round(Number(cash) * 100) : total;
    if (!Number.isSafeInteger(tender) || tender < total) {
      setError("The amount received must cover the order total.");
      return;
    }
    const payment =
      method === "MPESA"
        ? {
            method: "OTHER",
            reference: `M-PESA MANUAL:${reference.trim().toUpperCase()}`,
          }
        : method === "CARD"
          ? { method, reference: `LOCAL:${reference.trim()}` }
          : { method };
    const body = JSON.stringify({
      payments: total ? [{ ...payment, amountMinor: tender }] : [],
    });
    const payload = `${selected.id}:${body}`;
    if (paymentAttempt.current?.payload !== payload)
      paymentAttempt.current = { payload, key: crypto.randomUUID() };
    const key = paymentAttempt.current.key;
    void act(async () => {
      const completed = await api<Sale>(
        `${base}/sales/${selected.id}/complete`,
        {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body,
        },
      );
      setPaid(completed);
      setSelected(undefined);
      onPaid(completed);
      await load();
    });
  }

  const workflow = (category?: string | null) =>
    category ? businessProfiles[category]?.workflow : undefined;
  const selectedWorkflow = workflow(selected?.orderCategory);
  const stageIndex = selected?.orderStage
    ? orderStages.indexOf(selected.orderStage)
    : -1;
  const cashChange =
    selected && method === "CASH" && cash
      ? Math.max(0, Math.round(Number(cash) * 100) - selected.totalMinor)
      : 0;
  return (
    <OrderDialog title={title} onClose={onClose} busy={busy}>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {paid ? (
        <div className="pos-order-detail">
          <h3>Payment complete</h3>
          <p className="pos-order-money">
            {formatMinorCurrency(paid.totalMinor, paid.currency)}
          </p>
          <p>
            {paid.invoiceNumber}
            {paid.changeMinor > 0
              ? ` · Give ${formatMinorCurrency(paid.changeMinor, paid.currency)} change`
              : ""}
          </p>
          <div className="actions">
            <Can permissions={["receipt.print"]}>
              <Link
                className="button-link"
                href={`/sales/${paid.id}/receipt`}
                target="_blank"
                rel="opener"
              >
                Open receipt
              </Link>
            </Can>
            <button
              type="button"
              className="secondary"
              onClick={() => setPaid(undefined)}
            >
              Back to orders
            </button>
          </div>
        </div>
      ) : selected ? (
        <div className="pos-order-detail">
          <div className="actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setSelected(undefined);
                setError("");
              }}
            >
              Back to queue
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => openOrder(selected.id)}
            >
              Refresh ticket
            </button>
            <Link
              className="button-link secondary"
              href={`/pos/orders/${selected.id}`}
              target="_blank"
              rel="opener"
            >
              Print {selectedWorkflow?.ticket.toLowerCase() ?? "ticket"}
            </Link>
          </div>
          <h3>{selected.orderReference}</h3>
          <p>
            #{ticketNumber(selected.id)} · {selected.orderChannel} ·{" "}
            {selectedWorkflow?.steps[stageIndex] ?? selected.orderStage}
          </p>
          {selected.notes && (
            <p className="pos-order-notes">{selected.notes}</p>
          )}
          <ul className="pos-order-lines">
            {selected.items.map((item) => (
              <li key={item.id}>
                <span>
                  {item.quantity} × {item.productNameSnapshot}
                  {item.variantNameSnapshot
                    ? ` · ${item.variantNameSnapshot}`
                    : ""}
                  {item.staffProfile?.displayName
                    ? ` · ${item.staffProfile.displayName}`
                    : ""}
                </span>
                <strong>
                  {formatMinorCurrency(item.totalMinor, selected.currency)}
                </strong>
              </li>
            ))}
          </ul>
          <p className="pos-order-money">
            {formatMinorCurrency(selected.totalMinor, selected.currency)}
          </p>
          {selected.orderStage === "FULFILLED" ? (
            <Can permissions={["sale.create", "payment.record"]}>
              <form className="form" onSubmit={pay}>
                {selected.totalMinor > 0 && (
                  <>
                    <label>
                      Payment method
                      <select
                        value={method}
                        disabled={busy}
                        onChange={(event) => {
                          setMethod(event.target.value);
                          setReference("");
                        }}
                      >
                        <option value="CASH">Cash</option>
                        <option value="CARD">Local bank card</option>
                        <option value="MPESA">M-Pesa PayBill received</option>
                      </select>
                    </label>
                    {method === "CASH" ? (
                      <label>
                        Cash received
                        <input
                          type="number"
                          step="0.01"
                          min={selected.totalMinor / 100}
                          value={cash}
                          onChange={(event) => setCash(event.target.value)}
                          placeholder={(selected.totalMinor / 100).toFixed(2)}
                          disabled={busy}
                        />
                      </label>
                    ) : (
                      <label>
                        {method === "MPESA"
                          ? "Verified M-Pesa transaction code"
                          : "Terminal approval reference"}
                        <input
                          required
                          pattern={
                            method === "MPESA" ? "[A-Za-z0-9]{8,16}" : undefined
                          }
                          maxLength={80}
                          value={reference}
                          onChange={(event) => setReference(event.target.value)}
                          disabled={busy}
                        />
                      </label>
                    )}
                    {method === "MPESA" && (
                      <p className="muted">
                        Confirm the amount and transaction code in your PayBill
                        account before recording payment.
                      </p>
                    )}
                    {cashChange > 0 && (
                      <p>
                        Change due{" "}
                        <strong>
                          {formatMinorCurrency(cashChange, selected.currency)}
                        </strong>
                      </p>
                    )}
                  </>
                )}
                <button type="submit" disabled={busy}>
                  {busy ? "Recording…" : "Complete payment"}
                </button>
              </form>
            </Can>
          ) : (
            <div className="actions">
              <Can permissions={["sale.hold"]}>
                <button type="button" disabled={busy} onClick={advance}>
                  {selected.orderStage === "READY" &&
                  selected.orderCategory === "RESTAURANT_CAFE"
                    ? "Confirm served or delivered"
                    : `Mark ${selectedWorkflow?.steps[stageIndex + 1]?.toLowerCase() ?? "next stage"}`}
                </button>
              </Can>
              <Can permissions={["sale.cancel_draft"]}>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={cancel}
                >
                  Cancel order
                </button>
              </Can>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="pos-order-queue-toolbar">
            <p>
              {queue
                ? `${queue.total} open ${queue.total === 1 ? "order" : "orders"}`
                : "Loading orders…"}
            </p>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setError("");
                void load();
              }}
            >
              Refresh
            </button>
          </div>
          {queue?.items.length === 0 && (
            <p className="muted">
              Orders for this branch will appear here as soon as they’re placed.
            </p>
          )}
          <div className="pos-order-queue">
            {queue?.items.map((item) => {
              const stage = item.orderStage
                ? orderStages.indexOf(item.orderStage)
                : -1;
              return (
                <button
                  type="button"
                  key={item.id}
                  className="pos-order-card"
                  onClick={() => openOrder(item.id)}
                  disabled={busy}
                >
                  <span
                    className="pos-order-stage"
                    data-stage={item.orderStage}
                  >
                    {item.orderStage === "FULFILLED"
                      ? "Awaiting payment"
                      : (workflow(item.orderCategory)?.steps[stage] ??
                        item.orderStage)}
                  </span>
                  <strong>{item.orderReference}</strong>
                  <span>
                    {item.orderChannel} · #{ticketNumber(item.id)}
                  </span>
                  <span>
                    {item._count.items} lines ·{" "}
                    {formatMinorCurrency(item.totalMinor, item.currency)}
                  </span>
                </button>
              );
            })}
          </div>
          {queue && queue.total > pageSize && (
            <div className="actions">
              <button
                type="button"
                className="secondary"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>Page {page}</span>
              <button
                type="button"
                className="secondary"
                disabled={page * pageSize >= queue.total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </OrderDialog>
  );
}
