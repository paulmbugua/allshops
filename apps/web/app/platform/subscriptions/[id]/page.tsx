"use client";
import { useEffect, useState, use } from "react";
import { api } from "../../../lib/api";

type Detail = {
  id: string;
  status: string;
  organization: { name: string };
  plan: { name: string };
  billingRecords: Array<{
    id: string;
    billingNumber: string;
    status: string;
    amountMinor: number;
    currency: string;
  }>;
};
export default function PlatformSubscriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [detail, setDetail] = useState<Detail>();
  const [message, setMessage] = useState("");
  async function load() {
    setDetail(await api<Detail>(`/platform/subscriptions/${id}`));
  }
  useEffect(() => {
    void load().catch((error) =>
      setMessage(error instanceof Error ? error.message : "Unable to load."),
    );
  }, [id]);
  async function action(name: "suspend" | "reactivate") {
    await api(`/platform/subscriptions/${id}/${name}`, {
      method: "POST",
      body: JSON.stringify({ reason: "Platform administrator action" }),
    });
    await load();
  }
  async function confirm(billingRecordId: string) {
    const reference = window.prompt("Payment reference")?.trim();
    if (!reference) return;
    await api(`/platform/subscriptions/${id}/confirm-payment`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        billingRecordId,
        paymentMethod: "BANK_TRANSFER",
        paymentReference: reference,
      }),
    });
    await load();
  }
  return (
    <main className="workspace">
      <h1>{detail?.organization.name ?? "Subscription"}</h1>
      {message && <p className="notice">{message}</p>}
      {detail && (
        <>
          <section className="card">
            <h2>
              {detail.plan.name} · {detail.status}
            </h2>
            <div className="actions">
              <button onClick={() => void action("suspend")}>Suspend</button>
              <button
                className="secondary"
                onClick={() => void action("reactivate")}
              >
                Reactivate
              </button>
            </div>
          </section>
          <section className="card">
            <h2>Billing records</h2>
            {detail.billingRecords.map((bill) => (
              <div className="data-row" key={bill.id}>
                <strong>{bill.billingNumber}</strong>
                <span>
                  {bill.currency} {bill.amountMinor / 100}
                </span>
                <span>{bill.status}</span>
                {bill.status === "DUE" && (
                  <button onClick={() => void confirm(bill.id)}>
                    Confirm payment
                  </button>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
