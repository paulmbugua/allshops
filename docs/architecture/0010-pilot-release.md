# ADR 0010: Controlled pilot release

AllShops Phase 10 introduces operational rollout metadata without changing billing or merchant transaction ownership. `PilotOrganization` tracks the controlled cohort lifecycle (`PENDING_SETUP → ONBOARDING → READY_FOR_UAT → PILOT_ACTIVE → PAUSED → GRADUATED/EXITED`). Subscription status remains authoritative: a pilot flag cannot grant access that the plan does not provide.

`OrganizationFeatureFlag` is a platform-controlled kill switch. Effective access is user permission AND plan entitlement AND the organization flag where the feature is flagged. Platform-only routes require `User.isPlatformAdmin`; merchant owners cannot activate, graduate, or change rollout flags.

Readiness is derived from database state: active organization/subscription, branch, owner, POS user, sellable catalogue, stock location, and device. Onboarding records are progress/audit context, not a substitute for readiness.

Support diagnostics expose only version, status, devices, last sync, and conflict counts. Support issues and feedback are tenant-scoped. Product import, physical printer/scanner validation, and merchant training remain controlled pilot workflows and must not bypass normal services.

Pilot activation requires passing readiness or a platform-admin override with a recorded reason and audit event. The pilot is not general availability; graduation is an operational milestone, not a billing migration.
