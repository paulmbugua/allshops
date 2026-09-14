# API exposure inventory

All routes are under `/api/v1`. This inventory is intentionally grouped by trust boundary; the controller source and generated Swagger document in non-production environments are the detailed contract.

## Public

- `GET /health`, `/health/live`, `/health/ready`, and `/version`
- `GET /plans`
- `POST /auth/register`, `/auth/login`, `/auth/refresh`, and `/auth/accept-invite`

Authentication routes have dedicated IP/principal rate limits. Health responses expose state and build identity only, not credentials or database details.

## Authenticated merchant

- `/organizations/:organizationId`: organization, branch, user, role, and audit views
- catalogue and stock: categories, brands, units, products, inventory, movements, reconciliation, and transfers
- commerce: POS search, checkout, held sales, receipts, suppliers, purchasing, customers, repayments, expenses, appointments, staff, and commissions
- reporting: `/reports/*`, with server-side organization/branch authorization and formula-safe CSV export
- offline: device registration/revocation, bootstrap, sale sync, conflict review, and sync status
- SaaS: subscription selection/status/usage/billing and subscription-only Paystack initialize/verify

Tenant middleware, authentication, permission guards, subscription entitlement checks, payload limits, request deadlines, and route-category limits apply before business handlers. There is no merchant Paystack route and no organization-delete route.

## Platform-only

- `/platform/subscriptions/*`: list/details, manual payment confirmation, trial extension, suspension, reactivation, and plan change

These routes require both authentication and the platform-administrator flag. Platform actions are audited.

## Internal or disabled

- `GET /metrics` is disabled unless explicitly enabled and then requires a dedicated token. The production reverse proxy blocks it publicly.
- Swagger is disabled in production unless explicitly enabled for a private diagnostic environment.
- Prisma Studio, database, Redis, worker health, and infrastructure administration have no public proxy route.

## Deliberately absent

File upload, arbitrary URL fetch, organization deletion, public appointment booking, merchant Paystack collection, subscription webhooks, and debug endpoints are not exposed.
