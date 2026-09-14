# PostgreSQL backups

## Policy

PostgreSQL is authoritative. Initial pilot policy is daily custom-format backups, 7 daily copies, 4 weekly copies, and 3 monthly copies. Copy each verified dump and checksum off-host over TLS/SSH to encrypted storage. Managed-provider PITR may exceed this policy, but it does not remove quarterly restore testing. Redis is rebuildable and is not part of financial recovery. External product images/objects are currently deferred and will require a separate backup policy.

Use a dedicated backup role with the least privileges that allow consistent `pg_dump`. Provide credentials through a secret store, `.pgpass` with mode 0600, or the process environment; never type a password into shell history.

## Automated backup

```bash
export DATABASE_URL='postgresql://backup_user@db.example.com/allshops?sslmode=require'
export BACKUP_DIRECTORY=/srv/encrypted-backups/allshops
./ops/backup-postgres.sh
```

The script exits non-zero unless `pg_dump` succeeds, the file exceeds `MINIMUM_BACKUP_BYTES`, `pg_restore --list` succeeds, and SHA-256 verification succeeds. Schedule it in UTC with systemd/cron outside the API process, capture exit status, and alert on failure or a missed run.

## Isolated restore test

```bash
export DATABASE_URL='postgresql://backup_user@production-db/allshops?sslmode=require'
export RESTORE_DATABASE_URL='postgresql://restore_user@staging-db/allshops_restore_test?sslmode=require'
export BACKUP_FILE=/srv/encrypted-backups/allshops/daily/allshops-YYYYMMDDTHHMMSSZ.dump
./ops/restore-test.sh
DATABASE_URL="$RESTORE_DATABASE_URL" OPS_ENVIRONMENT=staging pnpm ops:reconcile-inventory
DATABASE_URL="$RESTORE_DATABASE_URL" OPS_ENVIRONMENT=staging pnpm ops:reconcile-customers
DATABASE_URL="$RESTORE_DATABASE_URL" OPS_ENVIRONMENT=staging pnpm ops:reconcile-suppliers
DATABASE_URL="$RESTORE_DATABASE_URL" OPS_ENVIRONMENT=staging pnpm ops:reconcile-subscriptions
```

Start a temporary API against the restored database and verify ready, login, sales counts, inventory, customers, suppliers, and subscription data. Destroy the isolated database only after recording the result. Never restore-test against production.
