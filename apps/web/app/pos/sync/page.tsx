"use client";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { api, selectedOrganization, type CurrentUser } from "../../lib/api";
import {
  getOfflineMetadata,
  pendingSales,
  updateLocalSyncResult,
  type LocalOfflineSale,
} from "../../lib/offline-db";
import { synchronizePending } from "../../lib/sync-manager";

type DeviceMetadata = {
  organizationId: string;
  deviceId: string;
};
type Conflict = {
  transactionUuid: string;
  localReference: string;
  clientCreatedAt: string;
  conflictCode: string | null;
  conflictMessage: string | null;
  payloadJson: {
    items?: Array<{ productNameSnapshot?: string; quantity: string }>;
    payments?: Array<{ amountMinor: number }>;
  };
  device: { name: string; branch: { name: string } | null };
  submitter: { name: string };
};

export default function OfflineSyncPage() {
  const organizationId = selectedOrganization();
  const [local, setLocal] = useState<LocalOfflineSale[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [device, setDevice] = useState<DeviceMetadata | null>(null);
  const [message, setMessage] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const load = useCallback(async () => {
    setLocal(
      (await pendingSales()).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    );
    if (!organizationId) return;
    const metadata = await getOfflineMetadata<DeviceMetadata>("device");
    setDevice(metadata);
    const me = await api<CurrentUser>("/auth/me");
    const currentPermissions =
      me.memberships.find((row) => row.organizationId === organizationId)
        ?.permissions ?? [];
    setPermissions(currentPermissions);
    const rows = currentPermissions.includes("sync.conflict.read")
      ? await api<Conflict[]>(
          `/organizations/${organizationId}/sync/conflicts?page=1&pageSize=100`,
        ).catch(() => [])
      : [];
    setConflicts(rows);
  }, [organizationId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function syncNow() {
    if (!organizationId || !device) {
      setMessage("Register and bootstrap this browser before synchronizing.");
      return;
    }
    try {
      await synchronizePending(organizationId, device.deviceId);
      setMessage("Synchronization finished.");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Synchronization failed.",
      );
      await load();
    }
  }
  async function resolve(
    transactionUuid: string,
    action: "ACCEPT_OVERRIDE" | "REJECT",
  ) {
    if (!organizationId) return;
    await api(
      `/organizations/${organizationId}/sync/conflicts/${transactionUuid}/resolve`,
      {
        method: "POST",
        body: JSON.stringify({ action }),
      },
    );
    await updateLocalSyncResult(transactionUuid, {
      status: action === "REJECT" ? "FAILED_PERMANENT" : "SYNCED",
    });
    await load();
  }
  return (
    <AppShell title="Offline synchronization">
      <section className="card">
        <div className="toolbar">
          <div>
            <h2>Local receipt history</h2>
            <p className="muted">
              Official invoices appear after server synchronization.
            </p>
          </div>
          {permissions.includes("sync.execute") && (
            <button onClick={() => void syncNow()}>Sync now</button>
          )}
        </div>
        {message && <p className="notice">{message}</p>}
        <div className="data-table">
          {local.map((sale) => (
            <div className="data-row" key={sale.transactionUuid}>
              <strong>{sale.localReference}</strong>
              <span>{new Date(sale.clientCreatedAt).toLocaleString()}</span>
              <span>
                {sale.payments.reduce(
                  (sum, payment) => sum + payment.amountMinor,
                  0,
                ) / 100}{" "}
                QAR
              </span>
              <span>{sale.status}</span>
              <span>Attempts {sale.attemptCount ?? 0}</span>
              <span>{sale.invoiceNumber ?? "No official invoice yet"}</span>
              <span>{sale.lastErrorCode ?? "—"}</span>
            </div>
          ))}
          {!local.length && (
            <p className="muted">No offline transactions on this browser.</p>
          )}
        </div>
      </section>
      {permissions.includes("sync.conflict.read") && !!conflicts.length && (
        <section className="card">
          <h2>Manager conflict queue</h2>
          <div className="data-table">
            {conflicts.map((conflict) => (
              <div className="data-row" key={conflict.transactionUuid}>
                <strong>{conflict.localReference}</strong>
                <span>
                  {conflict.submitter.name} · {conflict.device.name}
                </span>
                <span>{conflict.device.branch?.name ?? "Unknown branch"}</span>
                <span>
                  {new Date(conflict.clientCreatedAt).toLocaleString()}
                </span>
                <span>
                  {(conflict.payloadJson.items ?? [])
                    .map(
                      (item) =>
                        `${item.productNameSnapshot ?? "Product"} × ${item.quantity}`,
                    )
                    .join(", ")}
                </span>
                <span>
                  {(conflict.payloadJson.payments ?? []).reduce(
                    (sum, payment) => sum + payment.amountMinor,
                    0,
                  ) / 100}{" "}
                  QAR
                </span>
                <span>
                  {conflict.conflictCode}: {conflict.conflictMessage}
                </span>
                {permissions.includes("sync.conflict.resolve") && (
                  <span className="actions">
                    {conflict.conflictCode === "INSUFFICIENT_STOCK" && (
                      <button
                        onClick={() =>
                          void resolve(
                            conflict.transactionUuid,
                            "ACCEPT_OVERRIDE",
                          )
                        }
                      >
                        Accept override
                      </button>
                    )}
                    <button
                      className="danger"
                      onClick={() =>
                        void resolve(conflict.transactionUuid, "REJECT")
                      }
                    >
                      Reject
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
