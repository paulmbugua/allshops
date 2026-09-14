# ADR 0008: SaaS subscriptions and entitlements

## Status

Accepted for Phase 8.

## Context

AllShops needs commercial plan enforcement without allowing merchant POS payments to affect the platform's own subscription ledger. Enforcement must remain tenant-safe, concurrency-safe, and compatible with offline sales that were legitimately accepted by an authorized device.

## Decision

### Plans and trials

`Plan`, `PlanFeature`, and `PlanLimit` are the central catalogue. Stable feature codes are `pos`, `inventory`, `customers`, `suppliers`, `purchases`, `expenses`, `customer_credit`, `reports`, `reports_profit`, `exports`, `appointments`, `commissions`, `offline_pos`, and `multi_branch`. Stable limit codes are `branches.max`, `users.max`, `devices.max`, and `products.max`; a null value means unlimited.

New organizations receive a configurable 30-day `GROWTH` trial. Growth was selected deliberately because the existing onboarding and regression workflows create multiple branches; existing organizations are backfilled to a non-public, unrestricted `LEGACY` plan so deployment cannot silently revoke established access. A missing subscription is an error, never implicit unlimited access.

### Lifecycle and access

Server time is authoritative. The lifecycle is:

```text
TRIALING -> ACTIVE or EXPIRED
ACTIVE -> PAST_DUE -> GRACE_PERIOD -> SUSPENDED
ACTIVE -> CANCELLED -> EXPIRED
SUSPENDED/EXPIRED -> ACTIVE after platform-confirmed payment or reactivation
```

`SUBSCRIPTION_GRACE_DAYS` controls the grace deadline. Operations continue during `PAST_DUE`, `GRACE_PERIOD`, and a cancelled subscription's paid-through period. In `SUSPENDED` or `EXPIRED`, authentication, health, subscription and billing routes, and read-only merchant requests remain available. New transactional writes are blocked centrally. No merchant data is deleted or hidden by a status transition. Billing endpoints are explicitly exempt to avoid circular lockout.

Lifecycle normalization is idempotent and transactionally protected by a PostgreSQL advisory lock. The worker performs periodic normalization using the existing provider-neutral worker process and database; Redis remains the shared worker dependency. Repeated runs only write an event when the persisted status changes.

### Entitlements, RBAC, and limits

Authorization is the intersection of tenant membership, RBAC permission, subscription operational state, and feature entitlement. Hiding frontend navigation is never treated as enforcement. The API guard enforces write restrictions and module features, while creation services enforce limits inside their database transactions.

Active branches, active devices, active products, and `ACTIVE` or `INVITED` memberships consume quota. Inactive branches/products, revoked devices, and suspended memberships do not. Pending invitations reserve a user slot. Each quota mutation obtains a transaction-scoped advisory lock keyed by organization and limit code, then counts and inserts within that same transaction. This prevents two concurrent requests from consuming one final slot.

No cross-request entitlement cache is used in Phase 8. This costs a small number of indexed reads but prevents stale suspension, feature, and quota decisions. Request-scoped caching may be introduced later with explicit invalidation.

### Upgrades and downgrades

Merchant plan selection uses only server-side plan prices. Upgrades create a due billing record and become effective after platform payment confirmation. Downgrades are scheduled for the current period end only when current usage fits the target limits; otherwise they return `PLAN_DOWNGRADE_BLOCKED` and preserve all data. Phase 8 has no proration, credit balance, or automatic charging.

Plan price changes affect future billing records only. Every billing record snapshots plan code, plan name, interval, currency, amount, and period, so historical records are not recalculated.

### Billing separation and administration

`BillingRecord`, `BillingSequence`, and `SubscriptionEvent` form the AllShops SaaS billing domain. They have no relation to merchant `Sale`, `Payment`, customer credit, supplier payment, cash, or reporting aggregates. A subscription payment confirmation updates only the billing record, subscription, and subscription-event tables.

Billing numbers use an organization/year atomic sequence. Manual payment confirmation requires a platform administrator and a UUID idempotency key. The record's unique confirmation key and paid-state check prevent duplicate renewal extension. Merchant `OWNER` is not a platform administrator: platform permissions are excluded from merchant role seeding, and platform endpoints also verify `User.isPlatformAdmin` server-side. Platform-only reason text is not returned by merchant subscription APIs.

### Offline entitlement policy

Device bootstrap requires `offline_pos` and stores the server-issued subscription status, feature authorization, issue time, and expiry on the registered device. The expiry is bounded by the existing offline-session window. Sync never trusts an IndexedDB/client entitlement claim.

If the platform becomes suspended after bootstrap, a paid offline sale whose `clientCreatedAt` is within the previously issued entitlement window is accepted and audited. This preserves legitimately collected customer money. A transaction created after that entitlement expires is returned as `OFFLINE_ENTITLEMENT_EXPIRED`; reconnect/bootstrap cannot issue a new offline authorization while suspended. Subscription enforcement therefore blocks future work without corrupting a valid paid-but-unsynced transaction.

## Consequences

- PostgreSQL advisory locks are required for exact quota and lifecycle serialization.
- Suspended merchants retain read access, so particularly sensitive future read routes must still have explicit RBAC and tenant filters.
- Manual billing is operationally usable but requires platform staff; gateway settlement, proration, tax invoicing, and stored payment instruments remain deferred.
