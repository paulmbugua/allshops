import type { PosProduct } from "./sales";

export type LocalSyncState =
  | "LOCAL_PENDING"
  | "SYNCING"
  | "SYNCED"
  | "CONFLICT"
  | "FAILED_RETRYABLE"
  | "FAILED_PERMANENT";

export interface LocalOfflineSale {
  transactionUuid: string;
  deviceId: string;
  branchId: string;
  localReference: string;
  sequenceNumber: number;
  clientCreatedAt: string;
  catalogueSnapshotAt: string;
  offlineSessionIssuedAt: string;
  appVersion: string;
  payloadVersion: 1;
  items: Array<{
    productId: string;
    variantId?: string | null;
    staffProfileId?: string | null;
    quantity: string;
    priceSnapshotMinor: number;
    productNameSnapshot?: string;
    skuSnapshot?: string | null;
  }>;
  payments: Array<{
    method: "CASH" | "CARD" | "BANK_TRANSFER" | "QR" | "OTHER";
    amountMinor: number;
    tenderedMinor?: number;
    reference?: string | null;
  }>;
  status: LocalSyncState;
  createdAt: string;
  updatedAt: string;
  saleId?: string | null;
  invoiceNumber?: string | null;
  lastErrorCode?: string | null;
  attemptCount?: number;
}

const DB_NAME = "allshops-offline-pos";
const DB_VERSION = 1;

export function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("products")) {
        const products = db.createObjectStore("products", { keyPath: "key" });
        products.createIndex("barcode", "barcode", { unique: false });
        products.createIndex("sku", "sku", { unique: false });
        products.createIndex("normalizedName", "normalizedName", {
          unique: false,
        });
      }
      if (!db.objectStoreNames.contains("stockSnapshots"))
        db.createObjectStore("stockSnapshots", { keyPath: "key" });
      if (!db.objectStoreNames.contains("customers"))
        db.createObjectStore("customers", { keyPath: "id" });
      if (!db.objectStoreNames.contains("staff"))
        db.createObjectStore("staff", { keyPath: "id" });
      if (!db.objectStoreNames.contains("pendingSales"))
        db.createObjectStore("pendingSales", { keyPath: "transactionUuid" });
      if (!db.objectStoreNames.contains("syncQueue")) {
        const queue = db.createObjectStore("syncQueue", {
          keyPath: "transactionUuid",
        });
        queue.createIndex("status", "status", { unique: false });
        queue.createIndex("nextAttemptAt", "nextAttemptAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("metadata"))
        db.createObjectStore("metadata", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Offline database upgrade is blocked by another tab."));
  });
}

const complete = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(
        transaction.error ?? new Error("Offline transaction was not saved."),
      );
  });

export async function persistOfflineSale(
  input: Omit<LocalOfflineSale, "status" | "createdAt" | "updatedAt">,
) {
  const db = await openOfflineDb();
  const transaction = db.transaction(
    ["pendingSales", "syncQueue", "stockSnapshots"],
    "readwrite",
    { durability: "strict" },
  );
  const now = new Date().toISOString();
  const sale: LocalOfflineSale = {
    ...input,
    status: "LOCAL_PENDING",
    createdAt: now,
    updatedAt: now,
    attemptCount: 0,
  };
  transaction.objectStore("pendingSales").add(sale);
  transaction.objectStore("syncQueue").add({
    transactionUuid: sale.transactionUuid,
    type: "SALE",
    status: "LOCAL_PENDING",
    attemptCount: 0,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  });
  for (const item of sale.items) {
    const key = `${sale.branchId}:${item.productId}:${item.variantId ?? "BASE"}`;
    const store = transaction.objectStore("stockSnapshots");
    const request = store.get(key);
    request.onsuccess = () => {
      const current = request.result as
        { key: string; quantity: number } | undefined;
      if (current) {
        current.quantity -= Number(item.quantity);
        store.put(current);
      }
    };
  }
  try {
    await complete(transaction);
    return sale;
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError")
      throw new Error(
        "Offline storage is full. Reconnect and synchronize before continuing.",
      );
    throw error;
  } finally {
    db.close();
  }
}

export async function pendingSales(): Promise<LocalOfflineSale[]> {
  const db = await openOfflineDb();
  const request = db
    .transaction("pendingSales")
    .objectStore("pendingSales")
    .getAll();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      db.close();
      resolve(request.result as LocalOfflineSale[]);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function updateLocalSyncResult(
  transactionUuid: string,
  update: Partial<LocalOfflineSale>,
) {
  const db = await openOfflineDb();
  const transaction = db.transaction(
    ["pendingSales", "syncQueue"],
    "readwrite",
    {
      durability: "strict",
    },
  );
  const sales = transaction.objectStore("pendingSales");
  const request = sales.get(transactionUuid);
  request.onsuccess = () => {
    const current = request.result as LocalOfflineSale | undefined;
    if (current)
      sales.put({ ...current, ...update, updatedAt: new Date().toISOString() });
  };
  const queue = transaction.objectStore("syncQueue");
  const queueRequest = queue.get(transactionUuid);
  queueRequest.onsuccess = () => {
    const current = queueRequest.result as Record<string, unknown> | undefined;
    if (current)
      queue.put({
        ...current,
        status: update.status,
        updatedAt: new Date().toISOString(),
      });
  };
  await complete(transaction);
  db.close();
}

export async function replaceBootstrap(data: {
  organization: { id: string };
  branch: { id: string; name?: string };
  products: Array<
    Record<string, unknown> & {
      id: string;
      name: string;
      variants?: Array<Record<string, unknown> & { id: string; name: string }>;
      inventoryBalances?: Array<{
        variantId?: string | null;
        locationId: string;
        quantity: string;
      }>;
    }
  >;
  customers: Array<Record<string, unknown> & { id: string }>;
  staff: Array<Record<string, unknown> & { id: string }>;
  cursor: string;
  offlineSessionExpiresAt: string;
}) {
  const db = await openOfflineDb();
  const tx = db.transaction(
    ["products", "stockSnapshots", "customers", "staff", "metadata"],
    "readwrite",
  );
  tx.objectStore("products").clear();
  tx.objectStore("stockSnapshots").clear();
  for (const product of data.products) {
    tx.objectStore("products").put({
      ...product,
      key: `${product.id}:BASE`,
      normalizedName: product.name.toLowerCase(),
    });
    for (const variant of product.variants ?? [])
      tx.objectStore("products").put({
        ...product,
        ...variant,
        productName: product.name,
        productId: product.id,
        key: `${product.id}:${variant.id}`,
        normalizedName: `${product.name} ${variant.name}`.toLowerCase(),
      });
    for (const stock of product.inventoryBalances ?? [])
      tx.objectStore("stockSnapshots").put({
        ...stock,
        key: `${data.branch.id}:${product.id}:${stock.variantId ?? "BASE"}`,
        productId: product.id,
        branchId: data.branch.id,
        quantity: Number(stock.quantity),
        snapshotAt: data.cursor,
      });
  }
  for (const customer of data.customers)
    tx.objectStore("customers").put(customer);
  for (const row of data.staff) tx.objectStore("staff").put(row);
  tx.objectStore("metadata").put({
    key: "branchContext",
    value: {
      organizationId: data.organization.id,
      branchId: data.branch.id,
      branchName: data.branch.name ?? "Offline branch",
      cursor: data.cursor,
      offlineSessionExpiresAt: data.offlineSessionExpiresAt,
    },
  });
  await complete(tx);
  db.close();
}

export interface OfflineBranchContext {
  organizationId: string;
  branchId: string;
  branchName: string;
  cursor: string;
  offlineSessionExpiresAt: string;
}

export async function cachedPosProducts(branchId: string) {
  const db = await openOfflineDb();
  const [products, stock] = await Promise.all([
    new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const request = db
        .transaction("products")
        .objectStore("products")
        .getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }),
    new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const request = db
        .transaction("stockSnapshots")
        .objectStore("stockSnapshots")
        .getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }),
  ]);
  db.close();
  const quantities = new Map(
    stock.map((row) => [String(row.key), Number(row.quantity)]),
  );
  return products.map((row) => {
    const productId = String(row.productId ?? row.id);
    const variantId = row.productId ? String(row.id) : null;
    const key = `${branchId}:${productId}:${variantId ?? "BASE"}`;
    return {
      productId,
      variantId,
      name: String(row.productId ? row.productName : row.name),
      categoryName:
        (row.categoryName as string | null | undefined) ??
        (row.category && typeof row.category === "object"
          ? String((row.category as Record<string, unknown>).name ?? "") ||
            null
          : null),
      brandName:
        (row.brandName as string | null | undefined) ??
        (row.brand && typeof row.brand === "object"
          ? String((row.brand as Record<string, unknown>).name ?? "") || null
          : null),
      variantName: row.productId ? String(row.name) : null,
      sku: (row.sku as string | null | undefined) ?? null,
      barcode: (row.barcode as string | null | undefined) ?? null,
      imageUrl: (row.imageUrl as string | null | undefined) ?? null,
      type: row.type as "STOCK_ITEM" | "SERVICE" | "NON_STOCK_ITEM",
      priceMinor: Number(row.priceMinor),
      trackInventory: Boolean(row.trackInventory),
      allowNegativeStock: Boolean(row.allowNegativeStock),
      availableQuantity: row.trackInventory
        ? String(quantities.get(key) ?? 0)
        : null,
      unitSymbol: "unit",
    };
  });
}

export async function cachedPosProductByBarcode(
  branchId: string,
  rawBarcode: string,
): Promise<PosProduct | null> {
  const barcode = rawBarcode.trim();
  if (!barcode) return null;
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["products", "stockSnapshots"]);
    const productRequest = tx
      .objectStore("products")
      .index("barcode")
      .get(barcode);
    productRequest.onerror = () => reject(productRequest.error);
    productRequest.onsuccess = () => {
      const row = productRequest.result as Record<string, unknown> | undefined;
      if (!row) {
        resolve(null);
        return;
      }
      const productId = String(row.productId ?? row.id);
      const variantId = row.productId ? String(row.id) : null;
      const key = `${branchId}:${productId}:${variantId ?? "BASE"}`;
      const stockRequest = tx.objectStore("stockSnapshots").get(key);
      stockRequest.onerror = () => reject(stockRequest.error);
      stockRequest.onsuccess = () => {
        const stock = stockRequest.result as
          Record<string, unknown> | undefined;
        resolve({
          productId,
          variantId,
          name: String(row.productId ? row.productName : row.name),
          categoryName:
            (row.categoryName as string | null | undefined) ??
            (row.category && typeof row.category === "object"
              ? String((row.category as Record<string, unknown>).name ?? "") ||
                null
              : null),
          brandName:
            (row.brandName as string | null | undefined) ??
            (row.brand && typeof row.brand === "object"
              ? String((row.brand as Record<string, unknown>).name ?? "") ||
                null
              : null),
          variantName: row.productId ? String(row.name) : null,
          sku: (row.sku as string | null | undefined) ?? null,
          barcode: (row.barcode as string | null | undefined) ?? null,
          imageUrl: (row.imageUrl as string | null | undefined) ?? null,
          type: row.type as PosProduct["type"],
          priceMinor: Number(row.priceMinor),
          trackInventory: Boolean(row.trackInventory),
          allowNegativeStock: Boolean(row.allowNegativeStock),
          availableQuantity: row.trackInventory
            ? String(Number(stock?.quantity ?? 0))
            : null,
          unitSymbol: "unit",
        });
      };
    };
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error("Offline barcode lookup failed."));
    };
  });
}

export async function setOfflineMetadata(key: string, value: unknown) {
  const db = await openOfflineDb();
  const tx = db.transaction("metadata", "readwrite");
  tx.objectStore("metadata").put({ key, value });
  await complete(tx);
  db.close();
}

export async function getOfflineMetadata<T>(key: string): Promise<T | null> {
  const db = await openOfflineDb();
  const request = db.transaction("metadata").objectStore("metadata").get(key);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      db.close();
      resolve((request.result?.value as T | undefined) ?? null);
    };
    request.onerror = () => reject(request.error);
  });
}
