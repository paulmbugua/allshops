# ADR 0003 — POS Sales, Payments, and Receipts

## Status

Accepted for Phase 3.

## Checkout boundary

A completed sale is one PostgreSQL serializable transaction: the server resolves active products and variants, applies authoritative current prices and inherited variant prices/costs, calculates integer-minor-unit totals, allocates payments, generates the invoice number, persists immutable snapshots, posts `SALE` stock movements, updates cached balances, and writes audit records. Any failure rolls back the whole transaction. Write conflicts are retried with a bound.

The browser may display provisional cart totals, but it never supplies trusted price, cost, tax, discount total, or final totals. If a configured product price changes while it is in a cart, completion uses the current server price and returns the resolved totals.

## Idempotency and invoice numbering

Checkout and held-sale completion require a UUID `Idempotency-Key`. Records are scoped by organization, operation, and key. A successful response is persisted in the same transaction and returned for exact retries; reusing a key with a different request is rejected.

Invoices use organization-wide annual numbers (`INV-YYYY-000001`). `InvoiceSequence` is uniquely keyed by organization/year/document type. A transaction-level PostgreSQL advisory lock plus an atomic upsert/increment ensures concurrent checkouts cannot receive the same number. Rolled-back transactions do not consume a completed invoice number.

## Inventory

The branch's active default stock location is the selling location. `STOCK_ITEM` products with inventory tracking post one negative `SALE` movement per sale item, referencing the sale and identifying the sale item in the reason. Services and non-stock items never post movements. The existing balance policy rejects insufficient stock unless `allowNegativeStock` is enabled. The ledger remains the source of truth.

Held sales do not reserve stock, create payments, generate an invoice, or post movements. Completion re-resolves products, prices, and availability. Draft/held cancellation has no inventory or payment reversal. Completed sales cannot be cancelled through this Phase 3 endpoint.

## Money, discounts, and payments

All monetary values are integer minor units. Decimal quantities use `DECIMAL(18,4)` and line money is rounded once to the nearest minor unit with deterministic half-up rounding. Phase 3 tax is explicitly zero. Sale-level `FIXED` and basis-point `PERCENTAGE` discounts are calculated before tax and cannot exceed subtotal. CASHIER has no discount permission by default.

Multiple payment methods are supported. Applied payment amounts must equal the total. Submitted cash may exceed the remaining amount; the excess is stored as change, while each cash payment stores both its applied amount and tendered amount. Non-cash overpayment is rejected. Only safe optional terminal/transfer references are stored—never card credentials.

## Historical snapshots and authorization

Completed receipts render only `Sale` and `SaleItem` snapshots, so later catalogue edits cannot change an invoice. Product and sale cost fields are omitted unless the authenticated membership has `product.cost.read`. Organization and branch filters are present in every sales query. Receipt access and reprints require `receipt.print` and are audited.

## Deferred decisions

Refunds, returns, exchanges, payment void workflows, registers, shifts, customer accounts or credit, loyalty, tax/VAT configuration, payment-gateway processing, ESC/POS drivers, offline checkout, purchasing, expenses, reporting dashboards, restaurant KDS, hotel PMS, subscriptions, WhatsApp, and AI remain outside Phase 3.
