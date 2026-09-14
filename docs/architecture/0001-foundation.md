# ADR 0001 — AllShops V1 Foundation

## Status

Accepted for Phase 0 and extended by the Phase 1 security decisions below.

## Product boundary

AllShops V1 is a Qatar-first multi-tenant POS and small-business operating platform for retail and small service businesses.

## Initial stack

- pnpm workspaces + Turborepo
- Next.js/React/TypeScript for web/POS
- NestJS/TypeScript for API
- PostgreSQL + Prisma
- Redis + BullMQ
- Zod for shared validation contracts
- Docker-based local and production deployment

## Architectural rules

### Tenancy

Merchant data belongs to one organization. Application services must derive organization context from authenticated membership. Client-supplied `organizationId` must never be trusted as authorization.

### Branch scope

Operational entities such as sales, shifts, purchases, stock movements and expenses are branch-scoped whenever a physical location is relevant.

### Money

Persist money as integer minor units (`BigInt` in Prisma where amounts can grow). Never persist floats for currency.

### Financial immutability

Completed invoices and posted payments are not edited in place. Corrections are represented with explicit refund, void, credit or adjustment records.

### Inventory

Stock movements are the source of truth. Cached inventory balances may exist for performance, but must be reproducible from the ledger.

### Idempotency

Financial mutation endpoints must accept an idempotency key. A duplicate key within the same organization and operation must return the original result instead of creating another transaction.

### Auditability

Sensitive writes must capture actor, entity, action, time and relevant before/after data.

### Offline

Offline sales are deferred to a later phase, but IDs and transaction design must remain compatible with client-generated UUIDs, device identity and retry-safe writes.

## Phase 0 acceptance criteria

1. Monorepo layout and package boundaries are defined.
2. Prisma schema validates.
3. Shared contracts compile without depending on application code.
4. `.env.example` documents required infrastructure variables.
5. Local PostgreSQL and Redis can be started with Docker Compose.
6. No POS feature implementation is introduced in Phase 0.

## Phase 1 security extension

- A user can belong to multiple organizations through OrganizationUser; organization identity is never embedded as a trusted ownership claim in access tokens.
- Global authentication resolves the active user from a short-lived access JWT. Organization guards then resolve membership and database-backed permissions for the URL organization.
- Organization-owned reads include organizationId in the database query. Branch-scoped memberships additionally constrain branch reads and writes.
- Passwords use Argon2id. Refresh JWTs rotate on every use, are stored only in HTTP-only cookies, and only an HMAC hash is persisted.
- Invitation secrets are 256-bit random values stored only as SHA-256 hashes, expire, and are invalidated transactionally on acceptance.
- Errors are machine-readable without production stack traces. Correlation IDs and structured request logs exclude credentials and tokens.
- Merchant OWNER remains separate from future platform administration. The final active owner cannot be demoted or suspended.
- SameSite=Lax refresh cookies plus an explicit credentialed CORS allowlist protect refresh/logout. Access-authorized writes use bearer headers and are not ambient-cookie authenticated.
