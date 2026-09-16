"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  monthlyPriceMinor: number;
  annualPriceMinor: number;
  currency: string;
  features: Array<{ featureCode: string; enabled: boolean }>;
  limits: Array<{ limitCode: string; value: number | null }>;
};

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  useEffect(() => {
    void api<Plan[]>("/plans").then(setPlans);
  }, []);
  return (
    <main className="auth-page pricing-page">
      <section className="pricing-shell">
        <div className="pricing-heading">
          <div>
            <span className="pricing-kicker">Qatar-first commerce, made simple</span>
            <h1>Plans that grow with your shop</h1>
            <p>
              Start with the essentials, then unlock deeper control as your team
              and branches grow. Every plan includes secure access, Arabic-ready
              screens and automatic product updates.
            </p>
          </div>
          <div className="pricing-assurance" aria-label="Plan benefits">
            <span>✓ No setup surprises</span>
            <span>✓ Pay monthly or annually</span>
            <span>✓ Upgrade when ready</span>
          </div>
        </div>
        <div className="pricing-grid">
          {plans.map((plan) => (
            <article className={`pricing-plan pricing-plan-${plan.code.toLowerCase()}`} key={plan.id}>
              {plan.code === "BUSINESS" && <span className="pricing-badge">Most popular</span>}
              <div className="pricing-plan-top">
                <span className="pricing-plan-mark" aria-hidden>
                  {plan.code === "STARTER" ? "✦" : plan.code === "BUSINESS" ? "◆" : plan.code === "GROWTH" ? "↗" : "∞"}
                </span>
                <span className="pricing-plan-code">{plan.code}</span>
                <h2>{plan.name}</h2>
                <p>{plan.description ?? pricingDescription(plan.code)}</p>
              </div>
              <div className="pricing-price">
                {plan.code === "ENTERPRISE" ? (
                  <strong>Let’s talk</strong>
                ) : (
                  <>
                    <strong>{plan.currency} {(plan.monthlyPriceMinor / 100).toLocaleString()}</strong>
                    <span>/ month</span>
                  </>
                )}
              </div>
              <div className="pricing-plan-audience">
                <span>Best for</span>
                <strong>{pricingAudience(plan.code)}</strong>
              </div>
              <div className="pricing-limits">
                {plan.limits.slice(0, 4).map((limit) => (
                  <span key={limit.limitCode}>
                    <strong>{limit.value ?? "Unlimited"}</strong>
                    {pricingLimitLabel(limit.limitCode)}
                  </span>
                ))}
              </div>
              <div className="pricing-includes">
                <span>Includes</span>
                <ul>
                  {plan.features.filter((feature) => feature.enabled).slice(0, 7).map((feature) => (
                    <li key={feature.featureCode}>{pricingFeatureLabel(feature.featureCode)}</li>
                  ))}
                  {plan.code === "ENTERPRISE" && <li>Tailored rollout and priority guidance</li>}
                </ul>
              </div>
              <Link className="pricing-cta" href={plan.code === "ENTERPRISE" ? "mailto:support@ekazi.co.ke" : "/login"}>
                {plan.code === "ENTERPRISE" ? "Talk to our team" : "Get started"}
                <span aria-hidden>→</span>
              </Link>
              {plan.code !== "ENTERPRISE" && (
                <small className="pricing-annual">
                  {plan.currency} {(plan.annualPriceMinor / 100).toLocaleString()} billed annually
                </small>
              )}
            </article>
          ))}
        </div>
        <div className="pricing-footer">
          <span>Already have an AllShops account?</span>
          <Link href="/login">Sign in to your workspace →</Link>
        </div>
      </section>
    </main>
  );
}

function pricingDescription(code: string) {
  return ({
    STARTER: "A focused toolkit for a single counter and a growing catalogue.",
    BUSINESS: "Complete daily operations for established shops and service teams.",
    GROWTH: "Multi-branch control, offline selling and deeper performance insight.",
    ENTERPRISE: "A tailored operating system for complex, high-volume organisations.",
  } as Record<string, string>)[code] ?? "Flexible tools for your business.";
}

function pricingAudience(code: string) {
  return ({
    STARTER: "Independent shops and first-time POS teams",
    BUSINESS: "Busy stores, salons and service businesses",
    GROWTH: "Multi-branch businesses",
    ENTERPRISE: "Large teams and custom rollouts",
  } as Record<string, string>)[code] ?? "Growing Qatar businesses";
}

function pricingLimitLabel(code: string) {
  return ({
    "branches.max": "branches",
    "users.max": "users",
    "devices.max": "POS devices",
    "products.max": "products",
  } as Record<string, string>)[code] ?? code.replace(".max", "").replaceAll("_", " ");
}

function pricingFeatureLabel(code: string) {
  return ({
    pos: "Modern POS checkout",
    inventory: "Inventory control",
    customers: "Customer records",
    reports: "Core reporting",
    suppliers: "Suppliers and purchasing",
    purchases: "Purchase workflows",
    expenses: "Expense tracking",
    customer_credit: "Customer credit",
    reports_profit: "Profit reporting",
    exports: "Protected exports",
    appointments: "Appointments",
    commissions: "Staff commissions",
    offline_pos: "Offline POS",
    multi_branch: "Multi-branch operations",
  } as Record<string, string>)[code] ?? code.replaceAll("_", " ");
}
