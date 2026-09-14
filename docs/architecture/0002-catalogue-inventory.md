# ADR 0002 — Product Catalogue and Inventory Ledger

## Status

Accepted for Phase 2.

## Scope

Phase 2 introduces tenant-owned catalogue resources and branch/location-owned stock. It does not introduce sales, payments, purchasing, suppliers, customers, reporting, or other later-phase workflows.

## Catalogue ownership

Categories, brands, units, products, and variants carry `organizationId`. Services validate every referenced category, brand, unit, product, variant, branch, and location in the authenticated tenant. Product reads include related reference data in bounded queries; lists use page/pageSize pagination.

Normalized category and reference names enforce merchant-local uniqueness. Categories use a non-null `parentKey` (`ROOT` or the parent UUID), avoiding PostgreSQL null uniqueness gaps at the root. SKU and barcode constraints are merchant-scoped. Variants may override product costs/prices; null overrides inherit the parent value.

## Money and quantities

Money is stored as integer minor units. Browser decimal input is parsed as a string using integer arithmetic before submission. Inventory quantities use PostgreSQL `DECIMAL(18,4)` and Prisma Decimal at arithmetic boundaries.

## Locations

Products belong to organizations; stock belongs to a stock location and branch. Each existing and new branch has one default `Main Stock` location. A PostgreSQL partial unique index enforces at most one default per branch.

## Ledger and balance cache

Posted `StockMovement` rows are immutable and use signed quantities. `InventoryBalance` is a current-state cache updated in the same serializable database transaction as each movement. A non-null bucket key (`productId:variantId` or `productId:BASE`) makes base-product balance uniqueness reliable despite nullable variant IDs.

The reconciliation service groups ledger movements per location/product/variant and compares their sum with every cached balance. No repair endpoint is exposed in Phase 2.

Opening stock is limited to one `OPENING` movement per bucket. Incorrect entries are corrected with compensating adjustments. Products with `allowNegativeStock=false` reject any transaction that would make a balance negative.

## Concurrency and idempotency

Inventory writes use PostgreSQL serializable transactions with bounded retry on write conflicts. Competing stock reductions therefore cannot both commit from the same stale balance. Mutation endpoints accept UUID idempotency keys backed by the existing tenant/operation/key constraint; retries return the original stored response and a key cannot be reused for a different payload.

## Transfers

Transfers are organization-scoped and use human-readable, organization-serialized numbers such as `TRF-2026-000001`. The lifecycle is:

```text
DRAFT → SENT → RECEIVED
  └──→ CANCELLED
```

Sending atomically changes state and posts `TRANSFER_OUT`. Receiving atomically changes state and posts `TRANSFER_IN`. Destination stock is not credited before receipt. Only drafts can be cancelled, so posted source movements are never silently erased.

## Authorization

Phase 1 authentication, membership, organization-status, permission, and branch-scope guards remain authoritative. Phase 2 adds permissions for catalogue reading, category/brand/unit/product management, inventory reading/opening/adjustment/transfers, and transfer receipt. Branch-scoped users see only their branch balances and movement history.

## Deferred decisions

Image upload storage, advanced product options, FIFO/weighted-average valuation, purchasing receipts, sale-generated movements, stock reservation, in-transit reporting UI, and offline inventory writes remain deferred.
