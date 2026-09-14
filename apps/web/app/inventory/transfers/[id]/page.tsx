"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../../../components/app-shell";
import { Can } from "../../../components/permission-context";
import { api, selectedOrganization } from "../../../lib/api";
import { idempotencyKey } from "../../../lib/catalogue";
interface Transfer {
  id: string;
  transferNumber: string;
  status: string;
  notes?: string;
  createdAt: string;
  sentAt?: string;
  receivedAt?: string;
  fromBranch: { name: string };
  toBranch: { name: string };
  fromLocation: { name: string };
  toLocation: { name: string };
  creator: { name: string };
  items: {
    id: string;
    quantity: string;
    product: { name: string; sku?: string };
    variant?: { name: string } | null;
  }[];
}
export default function TransferPage() {
  const { id } = useParams<{ id: string }>();
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [message, setMessage] = useState("");
  const organizationId = selectedOrganization();
  useEffect(() => {
    void load();
  }, [organizationId, id]);
  async function load() {
    if (!organizationId) return;
    try {
      setTransfer(
        await api<Transfer>(
          `/organizations/${organizationId}/inventory/transfers/${id}`,
        ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load transfer.",
      );
    }
  }
  async function action(name: "send" | "receive" | "cancel") {
    if (!organizationId) return;
    try {
      await api(
        `/organizations/${organizationId}/inventory/transfers/${id}/${name}`,
        {
          method: "POST",
          headers:
            name === "cancel" ? {} : { "Idempotency-Key": idempotencyKey() },
        },
      );
      setMessage(`Transfer ${name} completed.`);
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update transfer.",
      );
    }
  }
  return (
    <AppShell title={transfer?.transferNumber ?? "Transfer"}>
      <section className="card">
        {transfer && (
          <>
            <div className="context-grid">
              <div>
                <small>Status</small>
                <strong>{transfer.status}</strong>
              </div>
              <div>
                <small>From</small>
                <strong>
                  {transfer.fromBranch.name} · {transfer.fromLocation.name}
                </strong>
              </div>
              <div>
                <small>To</small>
                <strong>
                  {transfer.toBranch.name} · {transfer.toLocation.name}
                </strong>
              </div>
              <div>
                <small>Created by</small>
                <strong>{transfer.creator.name}</strong>
              </div>
            </div>
            <h2>Items</h2>
            <div className="table-list">
              {transfer.items.map((item) => (
                <div className="table-row" key={item.id}>
                  <div>
                    <strong>{item.product.name}</strong>
                    <small>
                      {item.variant?.name ?? item.product.sku ?? "Base product"}
                    </small>
                  </div>
                  <strong>{item.quantity}</strong>
                  <span>units</span>
                </div>
              ))}
            </div>
            <div className="actions">
              {transfer.status === "DRAFT" && (
                <Can permissions={["inventory.transfer"]}>
                  <button onClick={() => void action("send")}>
                    Send transfer
                  </button>
                  <button
                    className="danger"
                    onClick={() => void action("cancel")}
                  >
                    Cancel draft
                  </button>
                </Can>
              )}
              {transfer.status === "SENT" && (
                <Can permissions={["inventory.transfer.receive"]}>
                  <button onClick={() => void action("receive")}>
                    Confirm receipt
                  </button>
                </Can>
              )}
            </div>
          </>
        )}
        {message && <p className="notice">{message}</p>}
      </section>
    </AppShell>
  );
}
