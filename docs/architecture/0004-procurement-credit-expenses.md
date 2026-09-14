# ADR 0004: Procurement, customer credit, and expenses

## Status

Accepted for Phase 4.

## Context

AllShops needs operational purchasing, receivables, and expense records without presenting them as a complete accounting system. These records extend the existing tenant, inventory, sale, payment, audit, and idempotency foundations.

## Decisions

### Purchases and receiving

Purchases use `DRAFT → PARTIALLY_RECEIVED → RECEIVED`, with `DRAFT → CANCELLED` as the only cancellation path. Received purchases cannot be cancelled or silently reverse stock. Draft item and header data may be edited only while the purchase is still `DRAFT`.

Purchase numbers are organization/year sequences (`PUR-YYYY-NNNNNN`) allocated inside a serializable transaction. The server calculates all line and document totals from decimal quantity and integer minor-unit inputs. Historical product, variant, SKU, and cost snapshots are retained.

Each receiving request selects a stock location belonging to the purchase branch. Every accepted quantity creates one positive `PURCHASE` stock movement referencing the purchase and purchase item, and updates the inventory balance in the same transaction. Partial receipts increment `receivedQuantity`; they never replace it. Row serialization, advisory locks, and transaction retries prevent over-receiving. A repeated idempotency key returns the original result without posting stock twice.

The latest received unit cost becomes the current product or variant cost. This is a simple latest-cost policy; weighted-average and FIFO valuation are deferred. Stock movements retain their historical unit cost so future valuation work does not depend on mutable catalogue cost.

### Supplier balances and payments

For an active purchase, `balanceMinor = totalMinor - paidMinor`. Payment state is derived as unpaid, partially paid, or paid. Supplier payments must be positive, immutable, allocated to one purchase belonging to the same supplier and organization, and cannot exceed its remaining balance. Concurrent payments lock the purchase and one idempotency key can create only one payment. Prepayments, unapplied cash, payment editing, and reversals are deferred.

### Customer credit and repayments

A sale may reference an active organization customer while preserving name and phone snapshots. A fully paid walk-in remains valid. Partial or zero immediate payment completes a sale only when a customer is attached and the actor has `sale.credit`; the unpaid amount becomes the sale balance and one immutable `CREDIT_SALE` customer-ledger debit. A `null` credit limit means no explicit monetary cap, while authorization still controls credit. A configured limit is checked against the locked current customer balance in the same serializable checkout transaction.

Customer repayments are positive immutable records. They create a ledger credit, reduce the cached customer balance, and allocate to outstanding sales oldest-first (FIFO), unless a specific outstanding sale is supplied. Overpayment is rejected. Checkout and repayment lock the customer and update the sale, inventory ledger, payment records, receivable ledger, and cached balances atomically. A failure in any component rolls back the whole operation.

Customer-ledger semantics are operational: `CREDIT_SALE` uses a positive debit, `PAYMENT` uses a positive credit, and `balanceAfterMinor` records the resulting receivable. It is not a double-entry general ledger.

### Expenses

Expense categories are organization scoped and can be deactivated. Expenses are branch-scoped, positive minor-unit records with a business date, category, payment method, optional reference, description, and attachment URL. A recorded expense is immutable: Phase 4 exposes no update or delete route. Duplicate creation is prevented with idempotency. Reversal records are deferred.

### Shared guarantees

- All money is persisted as integer minor units. Floating-point currency is never stored.
- Quantities use the Phase 2 `Decimal(18,4)` strategy.
- Tenant identity and permissions come from authenticated request context. Every lookup includes organization ownership; branch-scoped actors remain restricted to their branch.
- Receiving, supplier payments, credit checkout, customer repayments, and expense creation use idempotency records and serializable database transactions.
- Database checks enforce positive quantities and payments, received quantity not exceeding ordered quantity, non-negative balances and limits, and purchase total/paid/balance consistency.
- Supplier/customer balances and inventory balances are transactionally maintained caches backed by immutable transaction records and reconcilable ledgers.

## Consequences and deferred scope

Phase 4 provides operational supplier, inventory, receivable, payment, and expense histories. It does not provide purchase returns, sales returns/refunds, expense reversals, advanced AP/AR, tax filing, bank reconciliation, a chart of accounts, double-entry journals, or financial statements.
