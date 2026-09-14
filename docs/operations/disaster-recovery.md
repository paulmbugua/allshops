# Disaster recovery

Initial controlled-pilot target: **RPO ≤24 hours** and **RTO ≤4 hours**. This is an operational objective, not an SLA.

1. Declare the incident, assign a lead, preserve logs/request IDs, and identify the last known-good build and backup.
2. Enable `MAINTENANCE_MODE=true` or stop public writes if continuing could corrupt state. Health and platform operations remain available.
3. Provision a replacement PostgreSQL instance with TLS and restricted networking. Never restore over the damaged production database.
4. Verify the dump checksum and `pg_restore --list`, then restore using `ops/restore-test.sh` safety rules adapted to the replacement name.
5. Run `prisma migrate status`; apply only reviewed forward migrations required by the selected application image.
6. Run all four read-only reconciliation commands and compare organizations, users, sales, stock movements/balances, and subscriptions to the incident baseline.
7. Start a temporary API against the restored DB. Verify live/ready/version, a controlled tenant login, sales visibility, inventory reconciliation, customer balance reconciliation, and subscription access.
8. Update `DATABASE_URL` in the secret store, restart API/worker, verify readiness, and switch traffic.
9. Disable maintenance only after checkout and offline-sync safety are established. Monitor 5xx, conflicts, checkout failures, and worker jobs.
10. Record actual data-loss/recovery time, preserve the old database read-only, rotate exposed credentials, and complete a post-incident review.

Redis-loss recovery is restart/reprovision from empty Redis, followed by worker/API restart and verification that database-backed sales, payments, inventory, users, idempotency, subscriptions, and billing remain intact. Subscription lifecycle jobs are advisory-lock protected and idempotent. An offline retry after API failure reuses its transaction UUID and returns the single persisted sale.
