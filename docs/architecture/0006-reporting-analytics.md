# 0006 — Reporting, analytics, and exports

## Decision

Phase 6 uses a dedicated API reporting layer over the existing transactional tables. It does not persist report totals, create an accounting ledger, or introduce materialized views. Every query receives the authenticated `TenantContext`; `organizationId` is always added server-side and the effective branch is the membership branch or an authorized requested branch.

## Sources of truth and definitions

- Net sales are the sum of `Sale.totalMinor` for `COMPLETED` sales. Draft, held, and cancelled sales are excluded. This amount includes persisted tax.
- Gross sales are the sum of `Sale.subtotalMinor`; discounts and tax are reported separately.
- Gross profit is `SaleItem.totalMinor - round(SaleItem.unitCostMinor × quantity)`. Cost always comes from the historical sale-item snapshot, never current catalogue cost. Because line totals include tax, this Phase 6 gross-profit view is tax-inclusive; it is not called net profit.
- Collected payments are `Payment.amountMinor` for recorded payments on completed sales. `Sale.balanceMinor` (credit), `Payment.tenderedMinor`, and change are not collections. Customer repayments remain visible in the customer ledger and are not retroactively presented as checkout collections.
- Recorded expenses include only `Expense.status = RECORDED`.
- Customer balances use the customer ledger-maintained balance for all branches and outstanding completed-sale balances for a branch-scoped view.
- Supplier balances are the sum of outstanding balances on received/partially received purchases in the authorized branch scope.
- Inventory quantity is read from `InventoryBalance`. Valuation uses current product/variant cost and is an operational valuation, not historical accounting inventory valuation.

## API and query architecture

`ReportsController` validates framework-independent Zod contracts and delegates to `ReportsService`. Summary, grouped sales, payment, inventory, movement, procurement, expense, customer, supplier, appointment, and commission queries all carry explicit organization and branch predicates. Independent dashboard aggregates run in parallel. Current scale does not justify cached summaries; `REPORT_CACHE_TTL_SECONDS` reserves configuration for a later measured cache implementation.

The default detailed date range is 30 days and `dateTo` is interpreted as an inclusive calendar date by converting it to an exclusive next-day bound. Responses identify `Asia/Qatar`. Detailed movement/export reads are bounded, with `REPORT_EXPORT_MAX_ROWS` defaulting to 50,000.

## Authorization

Phase 6 adds granular `report.*` permissions. Gross profit requires both `report.profit` and `report.sales.cost`; inventory valuation requires `report.inventory.valuation`; exports require `report.export` plus the underlying report permission. Cost fields are omitted from grouped sales for callers without cost permission. Branch-bound memberships cannot request a different branch. Commission reports retain Phase 5 own-versus-all staff enforcement.

## CSV security and audit

CSV is UTF-8 with a BOM for Arabic interoperability. Every field is quoted and quotes are doubled. User-controlled values whose first meaningful character is `=`, `+`, `-`, or `@` are prefixed with an apostrophe, preventing spreadsheet formula execution. Export types are allow-listed, row-limited, permission-checked, and recorded as `REPORT_EXPORTED` audit events containing only report context—not exported data.

## Boundaries

No full accounting statements, VAT filing, bank reconciliation, scheduled reports, external BI, forecasting/AI, or heavy PDF engine are included. Browser print styles and CSV are the Phase 6 print/export boundary.
