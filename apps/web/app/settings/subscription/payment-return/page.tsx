"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "../../../components/app-shell";
import { api, selectedOrganization } from "../../../lib/api";

export default function SubscriptionPaymentReturnPage() {
  const organizationId = selectedOrganization();
  const [status, setStatus] = useState("Verifying your subscription payment…");
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    const queryReference = new URLSearchParams(window.location.search).get(
      "reference",
    );
    const reference =
      queryReference ??
      sessionStorage.getItem("allshops_subscription_paystack_reference");
    if (!reference) {
      setStatus("No Paystack payment reference was returned.");
      return;
    }
    void api<{ status: string }>(
      `/organizations/${organizationId}/payments/paystack/subscriptions/${encodeURIComponent(reference)}/verify`,
      { method: "POST" },
    )
      .then((result) => {
        if (result.status !== "COMPLETED") {
          setStatus(`Payment status: ${result.status}. You can retry safely.`);
          return;
        }
        sessionStorage.removeItem("allshops_subscription_paystack_reference");
        setComplete(true);
        setStatus("Payment verified. Your subscription is active.");
      })
      .catch((error) =>
        setStatus(
          error instanceof Error
            ? error.message
            : "Subscription verification failed. Do not pay again yet.",
        ),
      );
  }, [organizationId]);

  return (
    <AppShell title="Subscription payment">
      <section className="card">
        <h2>{complete ? "Subscription activated" : "Payment verification"}</h2>
        <p>{status}</p>
        <Link className="button-link" href="/settings/subscription">
          Back to subscription
        </Link>
      </section>
    </AppShell>
  );
}
