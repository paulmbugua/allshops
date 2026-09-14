import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import {
  openOfflineDb,
  pendingSales,
  persistOfflineSale,
} from "../app/lib/offline-db.js";

await new Promise<void>((resolve, reject) => {
  const request = indexedDB.deleteDatabase("allshops-offline-pos");
  request.onsuccess = () => resolve();
  request.onerror = () => reject(request.error);
});
const transactionUuid = crypto.randomUUID();
await persistOfflineSale({
  payloadVersion: 1,
  transactionUuid,
  deviceId: crypto.randomUUID(),
  branchId: crypto.randomUUID(),
  localReference: "OFFLINE-1",
  sequenceNumber: 1,
  clientCreatedAt: new Date().toISOString(),
  catalogueSnapshotAt: new Date().toISOString(),
  offlineSessionIssuedAt: new Date().toISOString(),
  appVersion: "test",
  items: [
    { productId: crypto.randomUUID(), quantity: "1", priceSnapshotMinor: 300 },
  ],
  payments: [{ method: "CASH", amountMinor: 300 }],
});

// The write helper closes its connection. Reopening simulates a browser reload.
const reopened = await openOfflineDb();
reopened.close();
const recovered = await pendingSales();
assert.equal(recovered.length, 1);
assert.equal(recovered[0]?.transactionUuid, transactionUuid);
assert.equal(recovered[0]?.status, "LOCAL_PENDING");
console.log(
  "Phase 7 IndexedDB durability passed: a paid pending sale survives close and reopen.",
);
