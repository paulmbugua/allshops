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
    <main className="auth-page">
      <section className="auth-card wide">
        <h1>AllShops plans</h1>
        <p>
          Qatar-first POS plans. Annual pricing is configured independently from
          monthly pricing.
        </p>
        <div className="product-grid">
          {plans.map((plan) => (
            <article className="card" key={plan.id}>
              <h2>{plan.name}</h2>
              <strong>
                {plan.code === "ENTERPRISE"
                  ? "Contact us"
                  : `${plan.currency} ${(plan.monthlyPriceMinor / 100).toLocaleString()} / month`}
              </strong>
              {plan.code !== "ENTERPRISE" && (
                <p>
                  {plan.currency}{" "}
                  {(plan.annualPriceMinor / 100).toLocaleString()} / year
                </p>
              )}
              <ul>
                {plan.limits.map((limit) => (
                  <li key={limit.limitCode}>
                    {limit.limitCode.replace(".max", "")}:{" "}
                    {limit.value ?? "Unlimited"}
                  </li>
                ))}
                {plan.features
                  .filter((feature) => feature.enabled)
                  .map((feature) => (
                    <li key={feature.featureCode}>
                      {feature.featureCode.replaceAll("_", " ")}
                    </li>
                  ))}
              </ul>
            </article>
          ))}
        </div>
        <Link href="/login">Sign in</Link>
      </section>
    </main>
  );
}
