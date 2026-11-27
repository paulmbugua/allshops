"use client";

import { businessProfiles, orderStages } from "@allshops/contracts";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../../../components/app-shell";
import { api, selectedOrganization } from "../../../lib/api";
import type { Sale } from "../../../lib/sales";

export default function OrderTicketPage() {
  const { id } = useParams<{ id: string }>();
  const organizationId = selectedOrganization();
  const [sale, setSale] = useState<Sale>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (!organizationId) return;
    const abort = new AbortController();
    void api<Sale>(`/organizations/${organizationId}/sales/${id}`, {
      cache: "no-store",
      signal: abort.signal,
    })
      .then((result) => {
        if (!result.orderStage) setError("Order ticket not found.");
        else setSale(result);
      })
      .catch((cause) => {
        if (!abort.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load the order ticket.",
          );
      });
    return () => abort.abort();
  }, [id, organizationId]);
  const workflow = sale?.orderCategory
    ? businessProfiles[sale.orderCategory]?.workflow
    : undefined;
  return (
    <AppShell title={workflow?.ticket ?? "Order ticket"}>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : !sale ? (
        <p role="status">Loading ticket…</p>
      ) : (
        <article className="receipt pos-order-ticket">
          <h2>
            {workflow?.ticket ?? "Order ticket"} #
            {sale.id.slice(0, 8).toUpperCase()}
          </h2>
          <p>
            <strong>{sale.orderReference}</strong> · {sale.orderChannel}
          </p>
          <p>
            {sale.branch.name} ·{" "}
            {new Intl.DateTimeFormat("en-KE", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Africa/Nairobi",
            }).format(new Date(sale.createdAt))}
          </p>
          <p>
            {sale.status === "CANCELLED"
              ? "Cancelled"
              : sale.status === "COMPLETED"
                ? "Completed"
                : workflow?.steps[orderStages.indexOf(sale.orderStage!)]}
          </p>
          <ul className="pos-order-lines">
            {sale.items.map((item) => (
              <li key={item.id}>
                {item.quantity} × {item.productNameSnapshot}
                {item.variantNameSnapshot
                  ? ` · ${item.variantNameSnapshot}`
                  : ""}
                {item.staffProfile?.displayName
                  ? ` · ${item.staffProfile.displayName}`
                  : ""}
              </li>
            ))}
          </ul>
          {sale.notes && <p className="pos-order-notes">{sale.notes}</p>}
          <p>Internal order ticket · Payment receipt issued at checkout</p>
          <button
            type="button"
            className="print-hidden"
            onClick={() => window.print()}
          >
            Print ticket
          </button>
        </article>
      )}
    </AppShell>
  );
}
