# Shared PostgreSQL and Redis host infrastructure

This stack is installed once at `/opt/infrastructure/postgres`; application
repositories join the private `shared_backend` Docker network. It publishes no
host ports. Each application receives its own PostgreSQL database and login,
while Redis keys are isolated by a mandatory application prefix.

The checked-in PostgreSQL profile targets a 16 GB VPS: PostgreSQL is capped at
3 GB, `shared_buffers` is 2 GB, `effective_cache_size` is 6 GB, and PgBouncer
uses transaction pooling. Re-measure under real load before raising any limit.

## First installation

```sh
cd /opt/apps/allshops
sudo INFRA_ROOT=/opt/infrastructure/postgres \
  ./ops/shared-infrastructure/install-from-repo.sh
sudo chown -R deploy:deploy /opt/infrastructure/postgres
cd /opt/infrastructure/postgres
./bin/configure.sh
./bin/create-app-db.sh allshops
```

Copy the four lines printed once by `create-app-db.sh` into the application's
private `ops/vps-production.env`. The password is retained only where required
by PostgreSQL/PgBouncer and is not written to a provisioning log or duplicate
credentials file. Never commit the private environment.

Configure an encrypted `rclone` destination in `OFFSITE_REMOTE`, run a manual
backup and restore test, then enable the timer:

```sh
./bin/backup-databases.sh allshops_db
./bin/create-app-db.sh allshops_restore_test
./bin/restore-test.sh /opt/infrastructure/postgres/backups/allshops_db/daily/FILE.dump allshops_restore_test_db
sudo ./bin/install-backup-timer.sh
```

`create-app-db.sh` refuses existing roles and never rotates a password silently.
Backups retain 7 daily, 4 weekly, and 3 monthly verified custom-format dumps and
fail when the mandatory offsite copy cannot be completed. Never run
`docker compose down -v`; the named volumes are deliberately stable.

## Capacity and alerts

| Component                                      |                Hard cap / planning range |
| ---------------------------------------------- | ---------------------------------------: |
| PostgreSQL                                     |  3 GB container cap; 2 GB shared buffers |
| PgBouncer                                      |                               192 MB cap |
| Shared Redis                                   |          512 MB cap; 384 MB data ceiling |
| AllShops API + worker + web                    | 2.5 GB combined hard cap; normally lower |
| OS, filesystem cache, Caddy and remaining apps |                     all remaining memory |

Run `bin/monitor.sh` after deployment and review it weekly. Investigate sustained
memory above 80%, swap activity, disk above 75%, pool waiters, connections near
120, or long-running queries. Add RAM before increasing `shared_buffers`; move a
high-traffic application to its own PostgreSQL host when its workload dominates
the shared cache, requires incompatible extensions/tuning, or creates noisy-neighbor
latency despite query and pool tuning. Plan the 16-to-24 GB upgrade before the
host reaches roughly 12–15 concurrently active Node applications, or sooner when
seven-day memory is above 80%, swap is regularly used, or PgBouncer queues work.
