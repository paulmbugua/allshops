import { API_URL } from "./api";
import { pendingSales, updateLocalSyncResult } from "./offline-db";

const channel =
  typeof BroadcastChannel === "undefined"
    ? null
    : new BroadcastChannel("allshops-sync");

async function run(organizationId: string, deviceId: string) {
  const queued = (await pendingSales()).filter((sale) =>
    ["LOCAL_PENDING", "FAILED_RETRYABLE", "SYNCING"].includes(sale.status),
  );
  if (!queued.length) return [];
  for (const sale of queued)
    await updateLocalSyncResult(sale.transactionUuid, {
      status: "SYNCING",
      attemptCount: (sale.attemptCount ?? 0) + 1,
    });
  const token = sessionStorage.getItem("allshops_access");
  const response = await fetch(
    `${API_URL}/organizations/${organizationId}/sync/sales`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        deviceId,
        transactions: queued.map((sale) => {
          const { status, createdAt, updatedAt, ...payload } = sale;
          void status;
          void createdAt;
          void updatedAt;
          return payload;
        }),
      }),
    },
  );
  if (!response.ok) throw new Error("Synchronization request failed.");
  const body = (await response.json()) as {
    results: Array<{
      transactionUuid: string;
      status: "SYNCED" | "CONFLICT" | "REJECTED";
      saleId?: string;
      invoiceNumber?: string;
      code?: string;
    }>;
  };
  for (const result of body.results) {
    await updateLocalSyncResult(result.transactionUuid, {
      status:
        result.status === "SYNCED"
          ? "SYNCED"
          : result.status === "CONFLICT"
            ? "CONFLICT"
            : "FAILED_PERMANENT",
      saleId: result.saleId,
      invoiceNumber: result.invoiceNumber,
      lastErrorCode: result.code,
    });
    channel?.postMessage({
      type: result.status === "SYNCED" ? "SALE_SYNCED" : "CONFLICT",
      ...result,
    });
  }
  return body.results;
}

export async function synchronizePending(
  organizationId: string,
  deviceId: string,
) {
  const locks = navigator.locks;
  if (locks)
    return locks.request("allshops-offline-sync", () =>
      run(organizationId, deviceId),
    );
  return run(organizationId, deviceId);
}
