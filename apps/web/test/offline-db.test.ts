import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import {
  cachedPosProductByBarcode,
  openOfflineDb,
  pendingSales,
  persistOfflineSale,
  replaceBootstrap,
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

const organizationId = crypto.randomUUID();
const branchId = crypto.randomUUID();
const productId = crypto.randomUUID();
const variantId = crypto.randomUUID();
await replaceBootstrap({
  organization: { id: organizationId },
  branch: { id: branchId, name: "Test branch" },
  products: [
    {
      id: productId,
      name: "Large catalogue item",
      barcode: "BASE-629001",
      sku: "BASE-1",
      type: "STOCK_ITEM",
      priceMinor: 1000,
      trackInventory: true,
      allowNegativeStock: false,
      variants: [
        {
          id: variantId,
          name: "Large",
          barcode: "VARIANT-629001",
          sku: "LARGE-1",
          priceMinor: 1500,
        },
      ],
      inventoryBalances: [
        { variantId: null, locationId: crypto.randomUUID(), quantity: "8" },
        { variantId, locationId: crypto.randomUUID(), quantity: "3" },
      ],
    },
  ],
  customers: [],
  staff: [],
  cursor: new Date().toISOString(),
  offlineSessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
});
const cachedVariant = await cachedPosProductByBarcode(
  branchId,
  "VARIANT-629001",
);
assert.equal(cachedVariant?.productId, productId);
assert.equal(cachedVariant?.variantId, variantId);
assert.equal(cachedVariant?.availableQuantity, "3");
assert.equal(await cachedPosProductByBarcode(branchId, "UNKNOWN-629001"), null);
console.log(
  "Phase 7 IndexedDB durability and exact offline barcode lookup passed.",
);
