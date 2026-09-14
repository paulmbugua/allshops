# Production security operations

## Exposure and routes

- Public: health live/ready, version, plans, register/login/refresh/invitation acceptance.
- Authenticated merchant: tenant/branch catalogue, inventory, POS, sales, procurement, customers, expenses, appointments, reports, devices/sync, subscription and billing routes.
- Platform-only: `/api/v1/platform/*`; `User.isPlatformAdmin` is checked in addition to authentication.
- Internal: metrics is disabled by default, token-protected when enabled, and blocked at public Nginx. Do not expose Swagger, Prisma Studio, Bull Board, DB, Redis, or debug endpoints.

Stable codes include `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `INSUFFICIENT_STOCK`, `PLAN_LIMIT_REACHED`, `FEATURE_NOT_INCLUDED`, `SUBSCRIPTION_SUSPENDED`, `SYNC_CONFLICT`, `RATE_LIMITED`, `MAINTENANCE`, and `INTERNAL_ERROR`. Production 5xx responses contain a safe message and request ID, never stack/SQL details. 429 and maintenance 503 include `Retry-After`.

## Secrets and response

Generate independent JWT keys with at least 256 bits of entropy. Store secrets in hosting/GitHub environment stores. Rotate DB credentials by issuing a new credential, updating the secret, restarting, verifying, then revoking the old one. Rotate Paystack keys in Paystack and the secret store; Paystack is subscription-only.

The current JWT design has one active key per token class. Rotation requires a communicated maintenance window: revoke sessions, change keys independently, restart API replicas, and require login. Dual-key rotation and MFA are deferred; platform admins require unique strong passwords, restricted production access, and audit review meanwhile.

## Browser/PWA and devices

Access tokens are session-scoped; refresh cookies are HttpOnly/Secure/SameSite. The service worker never caches authenticated API responses. On logout with no pending offline sale, cached POS/customer data may be cleared. With pending sales, preserve the queue, revoke the device server-side, and protect the workstation until an authorized operator resolves it. To retire a device: inspect pending count, sync or record support references, revoke in Settings → Devices, log out, then clear site storage.

Redirects must use application-relative paths. React escaping is retained; unsafe HTML and raw SQL are prohibited by source audit. Export filenames are allow-listed and CSV formula prefixes remain escaped. No server-side arbitrary URL fetch or file upload exists; SSRF/upload validation is currently N/A.

Normal merchant APIs cannot edit/delete audit logs. Critical actions retain actor/tenant context. Keep audit history during the pilot; later archival must preserve integrity. There is no organization-delete API. PostgreSQL RLS, formal privacy retention/deletion, and compliance certification remain future reviews.
