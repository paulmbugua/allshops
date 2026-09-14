"use client";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { api, selectedOrganization } from "../../lib/api";

type Details = {
  id: string;
  status: string;
  billingInterval: string;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  plan: { code: string; name: string; currency: string };
  pendingPlan: { name: string; effectiveAt: string } | null;
  features: Record<string, boolean>;
};
type Usage = Record<
  string,
  { current: number; maximum: number | null; percentage: number | null }
>;
type Plan = {
  id: string;
  code: string;
  name: string;
  monthlyPriceMinor: number;
  annualPriceMinor: number;
  currency: string;
};
type Bill = {
  id: string;
  billingNumber: string;
  planNameSnapshot: string;
  amountMinor: number;
  currency: string;
  status: string;
  paidAt: string | null;
};
type PlanSelection = { billingRecord: Bill | null; scheduled: boolean };
type PaystackIntent = { reference: string; authorizationUrl: string };

export default function SubscriptionPage() {
  const organizationId = selectedOrganization();
  const [details, setDetails] = useState<Details>();
  const [usage, setUsage] = useState<Usage>({});
  const [plans, setPlans] = useState<Plan[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [interval, setIntervalValue] = useState<"MONTHLY" | "ANNUAL">(
    "MONTHLY",
  );
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    if (!organizationId) return;
    const [nextDetails, nextUsage, nextPlans, nextBills] = await Promise.all([
      api<Details>(`/organizations/${organizationId}/subscription`),
      api<Usage>(`/organizations/${organizationId}/subscription/usage`),
      api<Plan[]>("/plans"),
      api<Bill[]>(`/organizations/${organizationId}/billing`),
    ]);
    setDetails(nextDetails);
    setUsage(nextUsage);
    setPlans(nextPlans);
    setBills(nextBills);
  }, [organizationId]);
  useEffect(() => {
    void load().catch((error) =>
      setMessage(
        error instanceof Error ? error.message : "Unable to load subscription.",
      ),
    );
  }, [load]);
  async function select(planCode: string) {
    if (!organizationId) return;
    try {
      const selection = await api<PlanSelection>(
        `/organizations/${organizationId}/subscription/select-plan`,
        {
          method: "POST",
          body: JSON.stringify({ planCode, billingInterval: interval }),
        },
      );
      if (selection.billingRecord) {
        await payBill(selection.billingRecord.id);
        return;
      }
      setMessage("Plan downgrade scheduled for the next billing period.");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Plan selection failed.",
      );
    }
  }
  async function payBill(billingRecordId: string) {
    if (!organizationId) return;
    try {
      const intent = await api<PaystackIntent>(
        `/organizations/${organizationId}/payments/paystack/subscriptions/${billingRecordId}/initialize`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
        },
      );
      sessionStorage.setItem(
        "allshops_subscription_paystack_reference",
        intent.reference,
      );
      window.location.assign(intent.authorizationUrl);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to open subscription payment.",
      );
    }
  }
  async function cancellation(action: "cancel" | "resume") {
    if (!organizationId) return;
    await api(`/organizations/${organizationId}/subscription/${action}`, {
      method: "POST",
    });
    await load();
  }
  return (
    <AppShell title="Subscription">
      {details && (
        <section className="card">
          <h2>
            {details.plan.name} · {details.status}
          </h2>
          <p>Billing cycle: {details.billingInterval}</p>
          {details.trialEndsAt && (
            <p>Trial ends {new Date(details.trialEndsAt).toLocaleString()}</p>
          )}
          {details.currentPeriodEnd && (
            <p>
              Current period ends{" "}
              {new Date(details.currentPeriodEnd).toLocaleString()}
            </p>
          )}
          {details.graceEndsAt && (
            <p>Grace ends {new Date(details.graceEndsAt).toLocaleString()}</p>
          )}
          {details.pendingPlan && (
            <p>
              Pending: {details.pendingPlan.name} at{" "}
              {new Date(details.pendingPlan.effectiveAt).toLocaleString()}
            </p>
          )}
          {details.currentPeriodEnd && (
            <button
              className="secondary"
              onClick={() =>
                void cancellation(
                  details.cancelAtPeriodEnd ? "resume" : "cancel",
                )
              }
            >
              {details.cancelAtPeriodEnd
                ? "Resume renewal"
                : "Cancel at period end"}
            </button>
          )}
        </section>
      )}
      <section className="card">
        <h2>Usage and limits</h2>
        <div className="data-table">
          {Object.entries(usage).map(([name, value]) => (
            <div className="data-row" key={name}>
              <strong>{name}</strong>
              <span>
                {value.current} / {value.maximum ?? "Unlimited"}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <div className="toolbar">
          <h2>Change plan</h2>
          <select
            value={interval}
            onChange={(event) =>
              setIntervalValue(event.target.value as "MONTHLY" | "ANNUAL")
            }
          >
            <option>MONTHLY</option>
            <option>ANNUAL</option>
          </select>
        </div>
        <div className="product-grid">
          {plans.map((plan) => (
            <button
              className="product-tile"
              key={plan.id}
              onClick={() => void select(plan.code)}
              disabled={plan.code === "ENTERPRISE"}
            >
              <strong>{plan.name}</strong>
              <span>
                {plan.code === "ENTERPRISE"
                  ? "Contact AllShops"
                  : `${plan.currency} ${((interval === "ANNUAL" ? plan.annualPriceMinor : plan.monthlyPriceMinor) / 100).toLocaleString()}`}
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>Billing history</h2>
        <div className="data-table">
          {bills.map((bill) => (
            <div className="data-row" key={bill.id}>
              <strong>{bill.billingNumber}</strong>
              <span>{bill.planNameSnapshot}</span>
              <span>
                {bill.currency} {(bill.amountMinor / 100).toLocaleString()}
              </span>
              <span>{bill.status}</span>
              <span>
                {bill.paidAt
                  ? new Date(bill.paidAt).toLocaleDateString()
                  : "Pending"}
              </span>
              {bill.status === "DUE" && (
                <button onClick={() => void payBill(bill.id)}>
                  Pay with Paystack
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
      {message && <p className="notice">{message}</p>}
    </AppShell>
  );
}
