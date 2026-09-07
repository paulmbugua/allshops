# ADR 0001 — AllShops V1 Foundation

## Status
Accepted for Phase 0.

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
