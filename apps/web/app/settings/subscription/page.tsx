"use client";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { api, selectedOrganization } from "../../lib/api";
import { usePermissions } from "../../components/permission-context";

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
  description: string | null;
  features: { featureCode: string; enabled: boolean }[];
  limits: { limitCode: string; value: number | null }[];
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
  const { can } = usePermissions();
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
      <section className="card subscription-plans-section">
        <div className="toolbar">
          <div>
            <span className="subscription-eyebrow">
              Plans built for Qatar businesses
            </span>
            <h2>Choose the way your business grows</h2>
            <p className="muted">
              Every plan includes secure cloud access, Arabic-ready experiences
              and automatic updates.
            </p>
          </div>
          <div className="billing-toggle" aria-label="Billing interval">
            <button
              className={interval === "MONTHLY" ? "active" : ""}
              onClick={() => setIntervalValue("MONTHLY")}
            >
              Monthly
            </button>
            <button
              className={interval === "ANNUAL" ? "active" : ""}
              onClick={() => setIntervalValue("ANNUAL")}
            >
              Annual <small>2 months free</small>
            </button>
          </div>
        </div>
        <div className="subscription-plan-grid">
          {plans
            .filter((plan) => plan.code !== "ENTERPRISE")
            .map((plan) => {
              const current = details?.plan.code === plan.code;
              const price =
                (interval === "ANNUAL"
                  ? plan.annualPriceMinor
                  : plan.monthlyPriceMinor) / 100;
              return (
                <article
                  className={`subscription-plan ${plan.code === "BUSINESS" ? "featured" : ""}`}
                  key={plan.id}
                >
                  {plan.code === "BUSINESS" && (
                    <span className="plan-ribbon">Most popular</span>
                  )}
                  <div className="plan-icon" aria-hidden>
                    {plan.code === "STARTER"
                      ? "✦"
                      : plan.code === "BUSINESS"
                        ? "◆"
                        : "▲"}
                  </div>
                  <span className="plan-code">{plan.code}</span>
                  <h3>{plan.name}</h3>
                  <p>{plan.description ?? planDescription(plan.code)}</p>
                  <div className="plan-price">
                    <strong>
                      {plan.currency} {price.toLocaleString()}
                    </strong>
                    <span>/{interval === "ANNUAL" ? "year" : "month"}</span>
                  </div>
                  <div className="plan-limits">
                    {plan.limits.map((limit) => (
                      <span key={limit.limitCode}>
                        <b>{limit.value ?? "Unlimited"}</b>{" "}
                        {limitLabel(limit.limitCode)}
                      </span>
                    ))}
                  </div>
                  <ul className="plan-features">
                    {plan.features
                      .filter((feature) => feature.enabled)
                      .map((feature) => (
                        <li key={feature.featureCode}>
                          {featureLabel(feature.featureCode)}
                        </li>
                      ))}
                  </ul>
                  <button
                    onClick={() => void select(plan.code)}
                    disabled={current || !can("billing.manage")}
                  >
                    {current
                      ? "Current plan"
                      : can("billing.manage")
                        ? `Choose ${plan.name}`
                        : "Owner approval required"}
                  </button>
                </article>
              );
            })}
        </div>
        {plans.some((plan) => plan.code === "ENTERPRISE") && (
          <div className="enterprise-callout">
            <div>
              <strong>Need a tailored rollout?</strong>
              <span>
                Enterprise adds custom limits, assisted deployment and
                multi-site planning.
              </span>
            </div>
            <a href="mailto:support@ekazi.co.ke">Talk to AllShops</a>
          </div>
        )}
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

function planDescription(code: string) {
  return (
    (
      {
        STARTER:
          "A focused toolkit for a single counter and a growing catalogue.",
        BUSINESS:
          "Complete daily operations for established shops and service teams.",
        GROWTH:
          "Multi-branch control, offline selling and deeper performance insight.",
      } as Record<string, string>
    )[code] ?? "Flexible tools for your business."
  );
}
function featureLabel(code: string) {
  return (
    (
      {
        pos: "Modern POS checkout",
        inventory: "Inventory control",
        customers: "Customer records",
        reports: "Core reporting",
        suppliers: "Suppliers & purchasing",
        purchases: "Purchase workflows",
        expenses: "Expense tracking",
        customer_credit: "Customer credit",
        reports_profit: "Profit reporting",
        exports: "Protected exports",
        appointments: "Appointments",
        commissions: "Staff commissions",
        offline_pos: "Offline POS",
        multi_branch: "Multi-branch operations",
      } as Record<string, string>
    )[code] ?? code.replaceAll("_", " ")
  );
}
function limitLabel(code: string) {
  return (
    (
      {
        "branches.max": "branches",
        "users.max": "users",
        "devices.max": "POS devices",
        "products.max": "products",
      } as Record<string, string>
    )[code] ?? code
  );
}
