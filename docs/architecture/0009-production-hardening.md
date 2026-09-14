# ADR 0009 — Production hardening and operations

## Status

Accepted for Phase 9. This ADR does not begin Phase 10. The filename follows the Phase 9 specification; the earlier Paystack ADR remains a historical payment-integration record.

## Production topology

The deployable units are immutable, non-root Docker images for the Next.js web app, NestJS API, and background worker. Nginx is the same-origin edge inside the stack: `/api/*` reaches the API and all other traffic reaches Next.js. TLS must terminate at Cloudflare, the hosting platform, or a TLS-enabled outer Nginx/load balancer before traffic reaches this internal proxy. PostgreSQL is external by default; Redis may be managed (`rediss://`) or the Compose service. No provider-specific runtime API is required.

PostgreSQL is authoritative for sales, payments, inventory, idempotency, users, subscriptions, and billing. Redis is disposable coordination/cache infrastructure; losing it can delay worker work but cannot erase financial state. Object storage is not materially implemented and needs a separate lifecycle/backup policy when introduced.

## Build, migration, and rollout

Each Dockerfile builds from repository root using pnpm's frozen lockfile and a multi-stage build. Images run as UID/GID 10001. Next.js uses standalone output; API and worker use pruned pnpm deployments. The release workflow tags images with the immutable Git SHA.

Production migration is a single pre-rollout `prisma migrate deploy` job. Application replicas never migrate at startup. Schema evolution follows expand → migrate/backfill → contract. A risky migration requires a verified backup and explicit review; recovery is a forward migration or database restore, not an assumed down migration. An unhealthy release stops before success; rollback deploys the prior immutable image only when its schema contract remains compatible.

## Health and reliability

- `/api/v1/health/live` proves the API process is alive.
- `/api/v1/health/ready` requires PostgreSQL. Redis loss produces `degraded`, because it is not authoritative for API financial writes.
- `/api/v1/version` returns version, Git SHA, and build time without secrets.
- The worker exposes port 4001 health endpoints and reports Redis/lifecycle status.
- API and worker enable graceful Nest shutdown. The worker prevents overlapping lifecycle runs, stops scheduling before shutdown, closes its health server, Redis, and Prisma.
- API request/body limits and Nginx timeouts are finite. Offline sync remains transactionally idempotent after restarts.

## Security and observability

Production validates HTTPS app/CORS origins, independent non-trivial JWT secrets, numeric limits, and metrics authentication. Proxy trust is explicit and normally set to one known proxy hop. Refresh cookies are HttpOnly, Secure, SameSite=Lax, scoped to auth, and time-bound. Credentialed CORS uses an exact allowlist. API/Next/Nginx set defense headers; the Next CSP needs `unsafe-inline` for framework bootstrap/styles but excludes `unsafe-eval`, external scripts, framing, and objects.

Production Swagger is disabled unless explicitly enabled. Metrics are disabled by default and require a 24+ character token even when enabled; Nginx blocks public metrics regardless. Logs are JSON on stdout/stderr with request ID and safe tenant/user context. Slow query events include SQL shape but never bound parameters. Optional Sentry envelope delivery hashes user/organization identifiers and sends no request bodies, tokens, passwords, or customer payloads.

Rate limits are tuned separately for login, registration, refresh, sync, exports, and billing. They are per-process safety limits; multi-replica deployments should enforce an additional edge/Redis distributed limit. Authorization and entitlements remain fail-closed and tenant/branch queries remain server-scoped.

## PWA, backups, and recovery

The service worker registers only in a secure context or localhost, never caches API responses, and is served with `no-store` so updates are discoverable. A forced refresh must not occur during checkout. Device revocation and IndexedDB recovery procedures are in the security runbook.

Self-hosted backups use custom-format `pg_dump`, validate size and `pg_restore --list`, store a SHA-256 checksum, and retain 7 daily, 4 weekly, and 3 monthly windows. Dumps must move off-host over encrypted transport into encrypted storage. Restore tests target a separately named test/restore/staging database and run integrity checks. Initial pilot objectives are RPO ≤24 hours and RTO ≤4 hours; these are targets, not an SLA.

## Deferred

Formal MFA, PostgreSQL RLS, dual-secret JWT rotation, full tenant export/deletion policy, object-storage lifecycle, Kubernetes, autoscaling, multi-region recovery, and formal compliance certification remain future defense-in-depth work.
