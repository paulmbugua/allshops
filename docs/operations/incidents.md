# Incident response

Capture timestamp, environment, build SHA, request ID, organization ID internally, invoice/transaction UUID when relevant, symptoms, and actions. Never paste tokens, passwords, payment data, database URLs, or customer payloads into tickets.

- **API / database outage:** check live and ready. If live is up but ready is 503 with PostgreSQL down, pause deploys/writes, inspect provider/network/pool limits, and use the DR runbook.
- **Redis outage:** API readiness reports degraded while persisted records remain safe. Restore Redis, restart the worker if needed, and verify lifecycle execution. Never restore financial state from Redis.
- **Worker down/backlog:** check port 4001 readiness and structured logs. Restart once Redis is healthy. Do not manually duplicate billing records.
- **Checkout failures:** search by request ID, organization, invoice, and transaction UUID. Check stock conflict, subscription entitlement, DB readiness, and 5xx metrics.
- **Inventory inconsistency:** stop affected writes if necessary; run the production read-only reconciliation. Never auto-fix; prepare an explicit audited compensating adjustment.
- **Offline conflict surge:** inspect device revocation, entitlement/price expiry, clock skew, duplicate hashes, and stock conflicts. Never erase browser IndexedDB queues.
- **Subscription failure:** inspect worker logs/events and confirm merchant POS money is untouched. Retry idempotently after resolving the cause.
- **Disk full:** stop growth, preserve the newest verified off-host backup, rotate Docker logs, add capacity, then validate PostgreSQL.

Alert on API/DB/worker down, readiness failure, 5xx or checkout-failure spikes, offline-conflict spikes, subscription-job failures, backup failure/missed backup, and high disk use. Finish with a timeline, impact, root cause, corrective actions, and validation evidence.
