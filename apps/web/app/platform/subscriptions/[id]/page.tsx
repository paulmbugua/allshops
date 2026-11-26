"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../../../lib/api";
import styles from "../../platform.module.css";

type Detail = {
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  organization: { name: string };
  plan: { name: string; code: string };
  events: Array<{
    id: string;
    eventType: string;
    occurredAt: string;
    metadata?: { reason?: string };
  }>;
  billingRecords: Array<{
    id: string;
    billingNumber: string;
    status: string;
    amountMinor: number;
    currency: string;
    paymentReference: string | null;
  }>;
};
type Plan = { code: string; name: string };
type Action =
  "extend-trial" | "change-plan" | "suspend" | "reactivate" | "confirm-payment";

export default function PlatformSubscriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const path = "/platform/subscriptions/" + id;
  const [detail, setDetail] = useState<Detail>();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingBill, setPendingBill] = useState<{ id: string; key: string }>();
  const load = useCallback(async () => {
    const [subscription, choices] = await Promise.all([
      api<Detail>(path),
      api<Plan[]>("/plans"),
    ]);
    setDetail(subscription);
    setPlans(choices);
  }, [path]);
  useEffect(() => {
    void load().catch((cause: Error) => {
      setError(true);
      setMessage(cause.message);
    });
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>, action: Action) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const reason = String(data.get("reason") ?? "").trim();
    let body: Record<string, unknown> = { reason };
    if (action === "extend-trial")
      body = { reason, days: Number(data.get("days")) };
    if (action === "change-plan")
      body = { reason, planCode: data.get("planCode") };
    if (action === "confirm-payment") {
      if (!pendingBill) return;
      body = {
        billingRecordId: pendingBill.id,
        paymentMethod: data.get("paymentMethod"),
        paymentReference: data.get("paymentReference"),
      };
    }
    setBusy(true);
    setMessage("");
    try {
      await api(path + "/" + action, {
        method: "POST",
        headers:
          action === "confirm-payment" && pendingBill
            ? { "Idempotency-Key": pendingBill.key }
            : undefined,
        body: JSON.stringify(body),
      });
      setPendingBill(undefined);
      await load();
      setError(false);
      setMessage(
        action === "confirm-payment"
          ? "Payment confirmed and plan activated."
          : "Subscription updated.",
      );
    } catch (cause) {
      setError(true);
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Unable to update the subscription.",
      );
    } finally {
      setBusy(false);
    }
  }

  const canExtend =
    detail?.trialEndsAt &&
    !detail.currentPeriodEnd &&
    ["TRIALING", "EXPIRED"].includes(detail.status);
  const canReactivate =
    detail?.status === "SUSPENDED" &&
    detail.currentPeriodEnd &&
    new Date(detail.currentPeriodEnd).getTime() > Date.now();
  return (
    <main className={styles.main}>
      <div>
        <Link href="/platform/subscriptions">All subscriptions</Link>
        <h1>{detail?.organization.name ?? "Subscription"}</h1>
        {detail && (
          <p>
            {detail.plan.name} · {detail.status.replaceAll("_", " ")}
          </p>
        )}
      </div>
      {message && (
        <p
          className={error ? "error" : "notice"}
          role={error ? "alert" : "status"}
        >
          {message}
        </p>
      )}
      {!detail && !message && <p role="status">Loading subscription…</p>}
      {detail && (
        <>
          <section className="card">
            <h2>Access dates</h2>
            {detail.trialEndsAt && (
              <p>Trial ends {new Date(detail.trialEndsAt).toLocaleString()}</p>
            )}
            <p>
              {detail.currentPeriodEnd
                ? "Paid period ends " +
                  new Date(detail.currentPeriodEnd).toLocaleString()
                : "No paid period recorded."}
            </p>
          </section>
          <div className={styles.grid}>
            {canExtend && (
              <form
                className="form card"
                onSubmit={(event) => void submit(event, "extend-trial")}
              >
                <h2>Extend trial</h2>
                <label>
                  Extra days
                  <input
                    name="days"
                    type="number"
                    min={1}
                    max={365}
                    defaultValue={7}
                    required
                  />
                </label>
                <label>
                  Reason
                  <input name="reason" minLength={3} maxLength={500} required />
                </label>
                <button disabled={busy}>Extend trial</button>
              </form>
            )}
            <form
              className="form card"
              onSubmit={(event) => void submit(event, "change-plan")}
              key={detail.plan.code}
            >
              <h2>Change plan</h2>
              <label>
                Plan
                <select name="planCode" defaultValue="" required>
                  <option value="" disabled>
                    Choose a plan
                  </option>
                  {plans
                    .filter(
                      (plan) =>
                        plan.code !== detail.plan.code &&
                        plan.code !== "LEGACY",
                    )
                    .map((plan) => (
                      <option key={plan.code} value={plan.code}>
                        {plan.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Reason
                <input name="reason" minLength={3} maxLength={500} required />
              </label>
              <button disabled={busy}>Save plan change</button>
            </form>
            {(canReactivate || detail.status !== "SUSPENDED") && (
              <form
                className="form card"
                onSubmit={(event) =>
                  void submit(event, canReactivate ? "reactivate" : "suspend")
                }
                key={detail.status}
              >
                <h2>
                  {canReactivate ? "Restore paid access" : "Suspend access"}
                </h2>
                <label>
                  Reason
                  <input name="reason" minLength={3} maxLength={500} required />
                </label>
                <button className="secondary" disabled={busy}>
                  {canReactivate
                    ? "Reactivate subscription"
                    : "Suspend subscription"}
                </button>
              </form>
            )}
          </div>
          <section className="card">
            <h2>Billing and plan activation</h2>
            <p>
              Confirm an invoice after verifying that the payment was received.
            </p>
            {detail.billingRecords.length === 0 && (
              <p>
                No billing records yet. A merchant can select a paid plan in
                their workspace to generate an invoice.
              </p>
            )}
            {detail.billingRecords.map((bill) => (
              <div className={styles.row} key={bill.id}>
                <strong>{bill.billingNumber}</strong>
                <span>
                  {new Intl.NumberFormat("en-KE", {
                    style: "currency",
                    currency: bill.currency,
                  }).format(bill.amountMinor / 100)}
                </span>
                <span>{bill.status}</span>
                {bill.status === "DUE" ? (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      setPendingBill({ id: bill.id, key: crypto.randomUUID() })
                    }
                  >
                    Review payment
                  </button>
                ) : (
                  <span>{bill.paymentReference}</span>
                )}
              </div>
            ))}
            {pendingBill && (
              <form
                className="form"
                key={pendingBill.id}
                onSubmit={(event) => void submit(event, "confirm-payment")}
              >
                <h3>
                  Confirm payment for{" "}
                  {
                    detail.billingRecords.find(
                      (bill) => bill.id === pendingBill.id,
                    )?.billingNumber
                  }
                </h3>
                <label>
                  Method
                  <select name="paymentMethod">
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="CASH">Cash</option>
                    <option value="OTHER">Other verified method</option>
                  </select>
                </label>
                <label>
                  Payment reference
                  <input name="paymentReference" required maxLength={160} />
                </label>
                <label>
                  <input type="checkbox" required /> I verified the amount and
                  reference against the received payment.
                </label>
                <div className="actions">
                  <button disabled={busy}>Confirm payment and activate</button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => setPendingBill(undefined)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </section>
          <section className="card">
            <h2>Subscription history</h2>
            {detail.events.length === 0 && <p>No subscription events.</p>}
            {detail.events.map((event) => (
              <div className={styles.row} key={event.id}>
                <strong>{event.eventType.replaceAll("_", " ")}</strong>
                <time dateTime={event.occurredAt}>
                  {new Date(event.occurredAt).toLocaleString()}
                </time>
                <span>{event.metadata?.reason}</span>
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
