# Pilot release checklist

- [ ] Typecheck, lint, critical/security/pilot suites pass.
- [ ] Migration is additive/backward compatible with pending offline payloads.
- [ ] Production Docker images build and run non-root.
- [ ] Staging smoke test and rollback procedure exercised where available.
- [ ] Release notes state changes, merchant action and known issues.
- [ ] Feature flags are off by default for sensitive rollout features.
- [ ] Backup/recovery evidence and support owner are confirmed.
