# ADR 0007: Offline-first POS and resilient synchronization

## Status

Accepted for Phase 7.

## Decision

Each browser installation is registered as a device and locked to one organization, branch, and user. A successful bootstrap stores the permitted catalogue, branch stock snapshot, customers, staff, a server-issued cursor, and a 24-hour offline-session expiry in IndexedDB. Refresh tokens and secrets are never stored there.

An offline sale has a client-generated UUID and immutable versioned payload. The browser writes the paid sale, its queue entry, and projected stock changes in one strict IndexedDB transaction. The UI does not report success until that transaction completes. A service worker caches the application shell but deliberately never caches API responses.

Synchronization is an authenticated batch operation. The API processes each entry independently and reuses the normal checkout, inventory-ledger, payment, invoice, and audit services. `(organizationId, transactionUuid)` is unique, and a SHA-256 payload hash makes a repeated delivery return the original outcome while rejecting reuse of a UUID with changed content.

The server remains authoritative for tenant, branch, device status, product status, inventory, and invoice numbering. Locally cached prices are honored when their server-issued catalogue snapshot is no more than 72 hours old; differences from current prices are audited. Older price snapshots produce a `PRICE_STALE` conflict. Credit sales are forbidden offline.

Concurrent offline devices can temporarily project the same available stock. On sync, serializable checkout transactions decide ordering: the first valid sale posts normally and a later sale that would oversell becomes an `INSUFFICIENT_STOCK` conflict. A manager can accept that specific transaction with a one-time negative-stock override. This does not alter the product's persistent negative-stock policy.

The browser uses Web Locks plus a BroadcastChannel to avoid duplicate simultaneous sync work across tabs. Server idempotency remains the final protection because locks cannot cover crashes, devices, or a response lost after commit.

## Failure behavior

- Lost response: repeating the identical UUID and payload returns the same sale and invoice without a second payment or stock movement.
- Browser reload or process termination: a sale already shown as paid remains in IndexedDB as pending, syncing, conflicted, or synced.
- Revoked, reassigned, inactive, or expired device context: synchronization is rejected and the local record remains available for resolution.
- Storage quota failure: checkout fails before the UI reports the sale as completed.
- Partial batch failure: successful items remain committed and every item receives its own result.

## Operational limits

- Offline session: 24 hours from bootstrap.
- Cached-price validity: 72 hours from the server-issued catalogue cursor.
- Batch size: 50 transactions.
- Clock-skew window: 24 hours.
