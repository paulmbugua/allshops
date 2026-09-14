# ADR 0011: Flutter mobile client

AllShops Mobile is a native Android/iOS client under `apps/mobile`. It does not duplicate business rules: the NestJS API remains authoritative for tenant boundaries, RBAC, plan entitlements, pricing, inventory, invoice numbering, subscription state and pilot flags.

The client uses secure platform storage for access tokens, a persisted private cookie jar for refresh sessions, and SQLite for bounded catalogue snapshots and paid offline transactions. Offline checkout commits the sale payload and sync state in one SQLite transaction before showing success. Synchronization sends the immutable Version 1 payload and transaction UUID; local records are retained with a terminal state after the server response.

The phone camera provides barcode input, while keyboard-style USB/Bluetooth scanners can use the search field. POS records cash and merchant-owned local bank terminal payments only. Paystack remains limited to platform subscription checkout.

Android is the initial pilot platform. Physical scanner, thermal printer, device sleep, storage pressure, real network loss and background execution require device UAT before merchant deployment.
