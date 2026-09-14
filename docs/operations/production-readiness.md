# Production readiness checklist

- [ ] DNS is correct; HTTP redirects to HTTPS; certificate and Cloudflare Full (strict), if used, are verified.
- [ ] Production/staging/development have separate DB, Redis, JWT, Paystack, and monitoring secrets.
- [ ] Managed DB/Redis TLS and network restrictions are enabled.
- [ ] No environment files/secrets are committed; gitleaks and source audit pass.
- [ ] CI passes Prisma, typecheck, lint, regression, critical, security, build, and containers.
- [ ] SHA-tagged images run as `allshops` UID 10001 and pass image scanning.
- [ ] One migration job completed; status was recorded; replicas never migrate at startup.
- [ ] API live/ready/version, web, worker ready, and Redis checks pass.
- [ ] CORS, cookies, proxy trust, headers/CSP, limits, and route-specific rate limits are verified.
- [ ] Swagger is disabled/protected; metrics and infrastructure admin tools are private.
- [ ] JSON logs, Sentry environment/release if used, alerts, disk monitoring, and log rotation work.
- [ ] Latest daily off-host encrypted backup and isolated restore/reconciliations passed.
- [ ] Rollback/schema compatibility and incident/DR ownership are documented.
- [ ] Offline lost-response retry, stock conflict, price expiry, reload durability, and revocation passed.
- [ ] Financial atomicity/uniqueness, reconciliations, commissions, and subscription idempotency passed.
- [ ] Paystack is subscription-only; POS offers cash and merchant local-card recording.
- [ ] Platform access is restricted/audited; MFA gap is explicitly accepted for the pilot.
- [ ] Email transport, object backup, privacy retention, and deferred scope are recorded.

This targets a monitored pilot for 5–10 Qatar businesses, not an enterprise SLA or compliance certification. Review dependencies monthly and immediately for critical advisories; major upgrades require a tested PR.
