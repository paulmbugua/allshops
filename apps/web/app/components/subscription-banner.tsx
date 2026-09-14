"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, selectedOrganization } from "../lib/api";

type Summary = {
  status: string;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  currentPeriodEnd: string | null;
};
export function SubscriptionBanner() {
  const [summary, setSummary] = useState<Summary>();
  useEffect(() => {
    const organizationId = selectedOrganization();
    if (!organizationId) return;
    void api<Summary>(`/organizations/${organizationId}/subscription`)
      .then(setSummary)
      .catch(() => undefined);
  }, []);
  if (!summary) return null;
  const target =
    summary.graceEndsAt ?? summary.trialEndsAt ?? summary.currentPeriodEnd;
  const days = target
    ? Math.max(0, Math.ceil((Date.parse(target) - Date.now()) / 86_400_000))
    : null;
  if (
    !["PAST_DUE", "GRACE_PERIOD", "SUSPENDED", "EXPIRED"].includes(
      summary.status,
    ) &&
    !(summary.status === "TRIALING" && days !== null && days <= 7)
  )
    return null;
  return (
    <p className="notice">
      Subscription status: {summary.status}
      {days !== null ? ` · ${days} days remaining` : ""}.{" "}
      <Link href="/settings/subscription">Review billing</Link>
    </p>
  );
}
