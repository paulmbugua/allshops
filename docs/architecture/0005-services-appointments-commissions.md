# ADR 0005: Services, appointments, and commissions

## Status

Accepted

## Context

AllShops must support appointment-led businesses without creating a second sales or payment engine. Bookings need tenant- and branch-safe staff assignment, working-hours and time-off enforcement, deterministic collision handling, service price snapshots, and commissions for both booked and walk-in service sales.

## Decision

- A `SERVICE` product gains an optional one-to-one `ServiceProfile` containing duration, booking buffers, and appointment eligibility. Catalogue price remains the default selling price.
- Staff are organization-scoped `StaffProfile` records. A profile may link to an organization user, but non-login staff are supported. `StaffService` and `StaffBranch` are explicit capability boundaries.
- Weekly availability stores Qatar local weekday and `HH:mm` values. Appointment timestamps are UTC; scheduling converts them through `Asia/Qatar`. Time off and active appointment service blocks use half-open intervals (`start < otherEnd` and `end > otherStart`).
- Every appointment service snapshots name, duration, price, staff, and its actual and buffer-blocked intervals. Cancelled and no-show appointments release their blocked time. Staff advisory locks plus serializable transactions prevent concurrent double booking.
- Lifecycle transitions are explicit: `BOOKED → CONFIRMED → IN_PROGRESS → COMPLETED`; `BOOKED` or `CONFIRMED` may become `CANCELLED` or `NO_SHOW`. Completed appointments are immutable and checkout is allowed once.
- Appointment checkout builds sale inputs from appointment snapshots and calls the existing atomic sale finalization path. Its idempotency operation is scoped to the appointment. The appointment-to-sale link and commissions commit in the same transaction.
- `SaleItem.staffProfileId` provides staff attribution for appointment and direct POS service lines. Stock and non-stock product lines reject staff attribution.
- Commission rule precedence is service-specific staff rule first, then the staff default. Overlapping active rules at the same precedence are rejected. Percentage commission uses the service line gross less its deterministic proportional share of the sale-level discount, rounded half-up to minor units. Fixed commission uses its configured minor-unit value capped at the net service line value. No rule produces no commission. A service with an active service-specific commission rule requires a capable staff selection at checkout.
- Earned commissions are immutable ledger rows linked to sale, sale item, staff, applicable rule, and optional appointment. They are not inferred during reporting.
- `SERVICE_STAFF` access to appointments and commissions is restricted to the staff profile linked to the signed-in user unless an explicit all-records permission is present.

## Consequences

The POS, payments, inventory, customer credit, invoice numbering, and receipt behavior remain centralized. Appointment price changes after booking do not affect checkout. Scheduling currently uses the organization’s Qatar timezone contract; supporting organizations in other timezones will require moving the timezone value into scheduling conversion and availability lookup.
