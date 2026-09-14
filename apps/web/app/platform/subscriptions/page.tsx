"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";

type Subscription = {
  id: string;
  status: string;
  organization: { name: string };
  plan: { name: string };
  currentPeriodEnd: string | null;
};
export default function PlatformSubscriptionsPage() {
  const [rows, setRows] = useState<Subscription[]>([]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void api<Subscription[]>("/platform/subscriptions?page=1&pageSize=100")
      .then(setRows)
      .catch((error) =>
        setMessage(
          error instanceof Error ? error.message : "Platform access required.",
        ),
      );
  }, []);
  return (
    <main className="workspace">
      <h1>Platform subscriptions</h1>
      {message && <p className="notice">{message}</p>}
      <section className="card data-table">
        {rows.map((row) => (
          <Link
            className="data-row"
            href={`/platform/subscriptions/${row.id}`}
            key={row.id}
          >
            <strong>{row.organization.name}</strong>
            <span>{row.plan.name}</span>
            <span>{row.status}</span>
            <span>
              {row.currentPeriodEnd
                ? new Date(row.currentPeriodEnd).toLocaleDateString()
                : "No paid period"}
            </span>
          </Link>
        ))}
      </section>
    </main>
  );
}
