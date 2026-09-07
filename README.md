# AllShops Qatar

Qatar-first, multi-tenant POS and small-business operating platform.

## Phase 0 status

This repository currently contains only the foundation, architecture decisions, database contract, and shared API contracts. Product features must be implemented incrementally in controlled phases.

## V1 scope

V1 targets retail and small service businesses in Qatar: minimarkets, shops, hardware, auto spares, salons, barbershops, laundry, printing, electronics, and similar SMEs.

Deferred from V1: hotel PMS, advanced restaurant KDS/table management, pharmacy/clinical workflows, payroll, full accounting ledger, payment processing, AI assistant, consumer mobile apps, and marketplace features.

## Architecture

- Monorepo: pnpm + Turborepo
- Web/POS: Next.js + React + TypeScript
- API: NestJS + TypeScript
- Database: PostgreSQL + Prisma
- Cache/queues: Redis + BullMQ
- Validation/contracts: Zod
- Offline store (later phase): IndexedDB/Dexie
- Deployment: Docker + reverse proxy/CDN

## Core invariants

1. Every merchant-owned record is tenant-scoped by `organizationId`.
2. Branch-operational records are also scoped by `branchId` where applicable.
3. Completed financial transactions are immutable; corrections happen through refund/void/adjustment records.
4. Inventory is ledger-based; stock movements are the source of truth.
5. Money is stored as integer minor units, never floating-point currency values.
6. Financial writes must support idempotency so retries cannot duplicate transactions.
7. Tenant identity is derived from authenticated server context, never trusted from arbitrary client input.

## Planned phases

0. Foundation + contracts
1. Identity, tenancy, branches and RBAC
2. Catalogue + inventory ledger
3. POS + payments + registers/shifts + receipts
4. Suppliers + purchases + expenses + customer credit
5. Service appointments + staff commissions
6. Reporting
7. Offline-first sales/sync
8. SaaS subscriptions
9. Security/performance hardening
10. Qatar pilot

See `docs/architecture/` for architecture decisions and `packages/database/prisma/schema.prisma` for the initial database contract.
