# AllShops Qatar

AllShops is a Qatar-first, multi-tenant POS and small-business operating platform. The repository implements Phases 0–9: foundation, authentication/tenancy/RBAC, catalogue/inventory, POS sales, procurement and credit, services and appointments, reporting, offline-first POS synchronization, SaaS subscriptions/entitlements, and production hardening/operations.

Production rollout: [Docker VPS deployment](docs/operations/deployment.md) for `allshops.ekazi.co.ke` and `api.ekazi.co.ke`, and [Flutter Google Play release](docs/operations/mobile-play-release.md) for the signed Android API 36 app bundle.

## Architecture

- Monorepo: pnpm workspaces and Turborepo
- Web: Next.js App Router, React, and TypeScript
- API: NestJS and TypeScript
- Worker: NestJS application context with a Redis connection
- Database: PostgreSQL and Prisma
- Cache and future queues: Redis (BullMQ jobs are intentionally deferred)
- Shared validation: framework-independent Zod contracts

The accepted decisions are documented in the numbered ADRs under [`docs/architecture`](docs/architecture), including [`0007-offline-pos-sync.md`](docs/architecture/0007-offline-pos-sync.md) and [`0008-saas-subscriptions.md`](docs/architecture/0008-saas-subscriptions.md).

## Prerequisites

- Node.js 20 or newer
- pnpm 10.15.0 (Corepack can activate the version declared in `package.json`)
- Docker with Docker Compose

## Local development

```bash
git clone https://github.com/paulmbugua/allshops.git
cd allshops
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

On Windows PowerShell, copy the environment file with:

```powershell
Copy-Item .env.example .env
```

The development services are available at:

- Web application: <http://localhost:3000>
- API: <http://localhost:4000/api/v1>
- API liveness: <http://localhost:4000/api/v1/health/live>
- API infrastructure readiness: <http://localhost:4000/api/v1/health/ready>
- API documentation (development only): <http://localhost:4000/api/docs>

The API validates every documented environment variable on startup. The worker validates the Redis URL and runtime environment. Keep real secrets in the untracked `.env`; never commit them.

## Validation commands

```bash
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Run the minimal platform seed after applying migrations with:

```bash
pnpm --filter @allshops/database seed
```

The idempotent seed creates the eight system roles, the Phase 1–8 permission registry, and the Starter, Business, Growth, Enterprise, and legacy-migration plans. Default organization units and a Growth trial are created transactionally when an organization is created. The seed does not create demonstration merchants, products, or transactions.

Reporting and analytics are available at `/reports` after sign-in. Reports derive from completed transactional records, enforce tenant and branch scope in the API, and require granular `report.*` permissions. Metric definitions and CSV security are documented in [`docs/architecture/0006-reporting-analytics.md`](docs/architecture/0006-reporting-analytics.md).

## Local infrastructure

`docker compose up -d` starts PostgreSQL 17 with an `allshops` database and a persistent Redis 7 instance. Inspect service health with:

```bash
docker compose ps
```

## Core invariants

1. Every merchant-owned record is tenant-scoped by `organizationId`.
2. Branch-operational records are also scoped by `branchId` where applicable.
3. Tenant identity must be derived from authenticated server context, never trusted from arbitrary client input.
4. Completed financial transactions are immutable; corrections use explicit refund, void, credit, or adjustment records.
5. Inventory is ledger-based; future stock movements are the source of truth.
6. Money is stored as integer minor units, never floating-point currency values.
7. Financial writes must support idempotency.

## Phase 1 authentication

- Registration immediately creates an authenticated session.
- Passwords use Argon2id and are never returned or logged.
- Access tokens are short-lived JWTs. Refresh tokens rotate in an HTTP-only, SameSite=Lax cookie; only an HMAC hash is persisted.
- The browser keeps only the short-lived access token in sessionStorage. Long-lived refresh tokens are never stored in web storage.
- Explicit credentialed CORS and SameSite cookies protect refresh requests. Production cookies also use Secure.
- Authentication endpoints are rate limited with environment-configurable buckets.
- Email delivery is deferred. Development and test responses expose the one-time invitation token for the accept-invite page.

## Phase 1 API

Authentication endpoints cover register, login, refresh, logout, current user, and invitation acceptance under /api/v1/auth.

Tenant administration endpoints cover organization create/read/update; branch create/list/read/update; membership list/invite/update; and role/audit retrieval under /api/v1/organizations/:organizationId.

Every organization route resolves active membership and database-backed permissions through reusable guards. Branch and membership queries include the organization ID directly, and branch-scoped members are restricted to their assigned branch.

## Phase 2 catalogue

Phase 2 adds organization-scoped categories, brands, units, products, and lightweight product variants. Categories support parent/child hierarchies. SKU and barcode values are optional and unique within a merchant catalogue. Product types are `STOCK_ITEM`, `SERVICE`, and `NON_STOCK_ITEM`; only stock-tracked stock items accept inventory movements.

Costs and selling prices are integer minor units. For example, QAR 15.50 is persisted as `1550`. Variant-specific cost and price values override the parent product when present; `null` means the variant inherits the product value. Arabic names are stored as Unicode text. Product image URLs are supported, while upload/storage infrastructure remains deferred.

Catalogue endpoints under `/api/v1/organizations/:organizationId` provide paginated categories, brands, units, products, filters, and variants. Merchant pages are available at `/products`, `/products/new`, `/products/:id`, `/categories`, `/brands`, and `/units`.

## Phase 2 inventory ledger

`StockMovement` is the source of truth. Quantities are signed PostgreSQL `Decimal(18,4)` values. `InventoryBalance` is only a transactionally maintained cache; the reconciliation endpoint compares every cached bucket with the ledger sum. A non-null internal bucket key guarantees one balance for a base product even when `variantId` is null.

Opening stock permits one `OPENING` entry per product/variant/location bucket. Corrections use adjustments rather than editing movements. Negative reductions are rejected unless the product explicitly enables negative stock. Serializable PostgreSQL transactions with retry handling prevent concurrent reductions from overselling a bucket. Opening, adjustment, transfer creation, transfer sending, and transfer receiving accept an optional UUID `Idempotency-Key` header.

Every branch has a `Main Stock` default location. The Phase 2 migration backfills existing branches, and new branches create their default location atomically.

Transfers follow `DRAFT → SENT → RECEIVED` or `DRAFT → CANCELLED`. Sending records `TRANSFER_OUT` at the source; receiving later records `TRANSFER_IN` at the destination, leaving stock visibly in transit. Sent transfers cannot be silently cancelled or posted twice.

Inventory pages are available at `/inventory`, `/inventory/movements`, `/inventory/adjustments/new`, `/inventory/transfers`, `/inventory/transfers/new`, and `/inventory/transfers/:id`.

Phase 2 API groups include:

- `/categories`, `/brands`, `/units`, `/products`, and `/products/:productId/variants`
- `/stock-locations`
- `/inventory`, `/inventory/movements`, and `/inventory/reconciliation`
- `/inventory/opening-stock` and `/inventory/adjustments`
- `/inventory/transfers` plus `send`, `receive`, and `cancel` transitions

OWNER and ADMIN receive all Phase 2 permissions. MANAGER receives catalogue and inventory management. INVENTORY_MANAGER can manage products and stock operations. CASHIER, ACCOUNTANT, and AUDITOR remain read-only for catalogue/inventory by default.

## Phase 3 POS and sales

The `/pos` workspace provides branch-aware product search and keyboard barcode scanning, cart quantity merging, available-stock hints, held carts, authorized discounts, flexible Qatar tender capture, double-submit protection, and receipt handoff. Cashiers can record cash or approval from a local card terminal such as QNB or Doha Bank. Paystack is not a merchant POS tender. Sales history is available at `/sales`; held and completed sale detail is at `/sales/:id`; the browser-printable bilingual 80 mm receipt is at `/sales/:id/receipt`.

API routes under `/api/v1/organizations/:organizationId` include `/pos/products`, `/sales/checkout`, `/sales`, `/sales/held`, `/sales/:saleId`, and explicit `complete`, `cancel`, and `receipt` operations. Checkout and held-sale completion require a UUID `Idempotency-Key`. Missing keys are rejected.

The server is authoritative for active products, variant ownership, price/cost inheritance, discounts, zero-tax Phase 3 totals, payment allocation, branch authorization, and stock. Completed checkout uses one serializable database transaction. Stock-tracked items create negative `SALE` ledger entries; services and non-stock items do not. Held sales reserve no inventory and are fully revalidated when completed.

Completed invoices use concurrency-safe organization/year sequences such as `INV-2026-000001`. Receipts use immutable sale-item snapshots, never current catalogue values. Cash tender can calculate change. Local terminal payments store the selected acquiring bank and optional terminal reference but no card credentials. Paystack card data stays on Paystack's hosted checkout.

Default Phase 3 access gives OWNER/ADMIN/MANAGER full sales operations, including discounts. CASHIER can create/read/hold/cancel drafts, record payments, and print receipts but cannot discount. ACCOUNTANT and AUDITOR have read/receipt access. Product and historical unit cost are exposed only with `product.cost.read`.

## Phase 4 procurement, expenses, and customer credit

Supplier profiles, draft purchases, partial goods receiving, latest-cost updates, purchase balances, and immutable supplier payments are available under `/suppliers` and `/purchases`. Receiving adds positive `PURCHASE` entries to the existing inventory ledger and is safe to retry.

Customer profiles and balances are available under `/customers`. Existing credit balances and later repayments remain available and are allocated to the oldest outstanding sales first. New POS checkout can be completed by cash or a merchant-operated local card terminal; Paystack is reserved for AllShops subscription billing.

Branch expenses and organization expense categories are available under `/expenses` and `/expense-categories`. Expense creation is idempotent and recorded expenses cannot be edited or deleted.

## Phase 5 services, appointments, and commissions

Service products can be configured with appointment duration and booking buffers. Staff profiles support optional login-account links, branch and service capabilities, weekly Qatar-local availability, and dated time off. Appointment endpoints and `/appointments` enforce explicit lifecycle transitions and transactionally prevent overlapping staff bookings, including concurrent requests.

A completed appointment checks out through the existing sale engine using its service price and staff snapshots. Direct POS service lines can also select capable staff. Both paths produce immutable commission rows from effective service-specific or staff-default percentage/fixed rules; percentage bases use each service line's proportional share of sale discount. Pages are available at `/staff`, `/appointments`, `/commission-rules`, and `/commissions`.

See `docs/architecture/0005-services-appointments-commissions.md` for scheduling, rule-precedence, rounding, idempotency, and privacy decisions.

## Phase 7 offline POS

Register and bootstrap a browser at `/settings/devices` while online. The POS can search its cached catalogue during an outage and persists paid-but-unsynced cash/local-terminal sales in IndexedDB before acknowledging them. Synchronization is idempotent, validates stale prices and entitlements, and records conflicts when another device consumes the final stock.

The server accepts server-issued price snapshots for up to 72 hours, rejects expired offline sessions and offline credit, and resolves stock using the same serializable checkout transaction as online POS. See [`docs/architecture/0007-offline-pos-sync.md`](docs/architecture/0007-offline-pos-sync.md) for delivery idempotency, conflict, multi-tab, and durability decisions.

## Phase 8 SaaS subscriptions

Public pricing is available at `/pricing`. Owners can view plan usage, choose a monthly or annual plan, review subscription billing records, cancel at period end, and resume at `/settings/subscription`. Platform administrators manage manual payment confirmation, trial extensions, suspension, reactivation, and plan changes under `/platform/subscriptions`.

New organizations receive a 30-day Growth trial. Feature and quota enforcement is server-side; branch, user, device, and product limits use transaction-scoped advisory locks so concurrent requests cannot overrun the final slot. Suspended or expired merchants retain billing and read-only access, while new transactional writes are blocked and all business data is preserved.

AllShops subscription billing is isolated from merchant POS money. Subscription payment confirmation writes only SaaS billing/subscription records and never creates or changes a merchant sale, POS payment, customer receipt, supplier payment, or merchant report total. Offline devices receive a bounded entitlement snapshot; legitimately paid sales created within that window remain syncable after a later suspension, while sales after snapshot expiry conflict. See [`docs/architecture/0008-saas-subscriptions.md`](docs/architecture/0008-saas-subscriptions.md).

## Subscription-only Paystack checkout

Set `PAYSTACK_SECRET_KEY`, `PAYSTACK_SUBSCRIPTION_CALLBACK_URL`, and the account-supported `PAYSTACK_CURRENCY` in the API environment. The secret is server-only; never place it in `NEXT_PUBLIC_*` configuration. Only AllShops subscription checkout initializes Paystack with `channels: ["card"]`. Merchant POS checkout remains cash or a card approved on the merchant's own local bank terminal. The API verifies reference, status, exact amount, currency, and channel before activating a subscription. If the QAR ledger currency differs from the Paystack account currency, configure `PAYSTACK_QAR_TO_KES_RATE`; both amounts are preserved. Repeated initialization and verification are idempotent.

## Production operations

Production images, Compose, reverse proxy, CI/CD, backups, recovery, security, observability, and readiness procedures are documented in [`docs/architecture/0009-production-hardening.md`](docs/architecture/0009-production-hardening.md) and [`docs/operations`](docs/operations). Build all production images with `pnpm docker:build`; deploy migrations once with `pnpm db:migrate`; verify a deployment with `pnpm smoke:production`.

## Phase boundary

Purchase returns, sales refunds/returns, expense reversals and commission reversals, advanced accounts receivable/payable, full accounting/general ledger, automatic recurring subscription payments, stored cards, Paystack webhook reconciliation, proration, subscription tax invoicing, loyalty, WhatsApp, AI, restaurant KDS, and hotel PMS remain deferred to later controlled phases.
## Controlled pilot readiness

AllShops is in controlled pilot readiness stage, not general availability. Phase 10 supports a 5–10 merchant Qatar cohort with platform-admin pilot lifecycle controls, database-derived readiness, tenant-scoped support diagnostics/issues, and documented UAT and release procedures. See `docs/pilot/` and `docs/architecture/0010-pilot-release.md`.

## Flutter mobile POS

The native Android/iOS client lives in `apps/mobile`. It shares the existing API, RBAC, tenancy, subscription and offline-sync rules while providing a touch-first POS, camera barcode scanning, secure session storage and a durable SQLite sale queue. See `apps/mobile/README.md` for SDK setup and run commands.
