# AllShops production rollout

## Chosen topology

AllShops uses Docker on the HostPinnacle Ubuntu VPS. The Next.js client,
NestJS API and worker remain application-owned containers. PostgreSQL,
PgBouncer and Redis are host infrastructure shared safely by multiple projects:

- `https://allshopspos.com` and `https://www.allshopspos.com` — customer web application
- `https://allshopspos.com/api/v1/*` — same-origin browser API proxy
- `https://api.allshopspos.com/api/v1/*` — public API for Flutter and integrations
- Dedicated Cloudflare Tunnel — outbound-only public edge and managed HTTPS
- Next.js — private container port 3000
- NestJS API — private container port 4000
- PostgreSQL 17 — one database and least-privilege login per application
- PgBouncer — transaction pooling for normal application traffic
- Redis 7.4 — shared service with mandatory per-application key prefixes
- Worker — private backend network plus a separate outbound network
- One-shot migration container — must finish successfully before API/worker start

Cloudflare Workers and Wrangler are deliberately not used. A dedicated,
remotely managed Cloudflare Tunnel connects Cloudflare to the private web and
API containers. No application port or origin certificate is exposed on the
host. The web application remains a stateful Next.js server beside the API.

## 1. Prepare the Cloudflare Tunnel

Create a dedicated tunnel named `allshops-production`, then add these public
hostnames in the tunnel dashboard. Cloudflare creates the proxied DNS records:

| Public hostname | Internal service |
| --- | --- |
| `allshopspos.com` | `http://allshops-web:3000` |
| `www.allshopspos.com` | `http://allshops-web:3000` |
| `api.allshopspos.com` | `http://allshops-api:4000` |

Copy the generated connector token once into the private
`ops/vps-production.env` as `CLOUDFLARE_TUNNEL_TOKEN`. Never commit or print it.
Enable Always Use HTTPS and leave WebSockets enabled. Add a cache bypass rule
for `api.allshopspos.com/*` and `allshopspos.com/api/*`; cache only immutable
`/_next/static/*` assets. Do not expose ports 3000, 4000, 5432, 6379 or 6432.

The connector makes outbound QUIC/HTTPS connections, so the tunnel does not
need inbound ports 80/443 or a Caddy certificate. Caddy remains an explicitly
selected fallback (`EDGE_MODE=caddy`) for hosts that require it.

## 2. Prepare the VPS

The shared profile targets the current 16 GB host and leaves memory for the OS,
Caddy, and the other application containers. Install Docker Engine with the
Compose plugin, Git, curl, OpenSSL and rclone. Keep UFW limited to SSH, HTTP and
HTTPS; PostgreSQL, PgBouncer and Redis publish no host ports. Then:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw deny 5432/tcp
sudo ufw deny 6379/tcp
sudo ufw deny 6432/tcp
sudo ufw --force enable
sudo ufw status verbose
```

```bash
sudo mkdir -p /opt/apps/allshops
sudo chown "$USER":"$USER" /opt/apps/allshops
git clone https://github.com/paulmbugua/allshops.git /opt/apps/allshops
cd /opt/apps/allshops
cp ops/vps-production.env.example ops/vps-production.env
chmod 600 ops/vps-production.env
```

Install the shared backend once. The installer never overwrites an existing
`.env`, PgBouncer user list, database volume, or Redis volume:

```bash
sudo INFRA_ROOT=/opt/infrastructure/postgres ./ops/shared-infrastructure/install-from-repo.sh
sudo chown -R "$USER":"$USER" /opt/infrastructure/postgres
cd /opt/infrastructure/postgres
./bin/configure.sh
./bin/create-app-db.sh allshops
```

Copy the four values printed once by `create-app-db.sh` into
`/opt/apps/allshops/ops/vps-production.env`, then populate the remaining
`REPLACE_...` values. `DATABASE_URL` uses PgBouncer; `DIRECT_DATABASE_URL`
bypasses it only for Prisma migrations and administration. Use the Paystack live
secret only on the API container. Never commit either environment file.

## 3. Build and deploy

AllShops uses its dedicated tunnel container by default. It joins
`allshops_edge`, reaches the web/API only by their Docker aliases, and has a
separate outbound network for Cloudflare connectivity.

```bash
chmod +x ops/deploy-vps.sh
./ops/deploy-vps.sh
```

For a future dedicated VPS, omit `CADDY_CONTAINER` and the guarded deployment
uses the `standalone-edge` profile.

These are the production build and deploy commands from `/opt/allshops`:

```bash
docker compose --env-file ops/vps-production.env -f docker-compose.prod.yml config --quiet
docker compose --env-file ops/vps-production.env -f docker-compose.prod.yml build --pull
docker compose --env-file ops/vps-production.env -f docker-compose.prod.yml up -d --remove-orphans
```

The guarded rollout verifies all three shared dependencies, refuses an
unverified legacy database cutover, creates a verified pre-deployment backup,
runs migrations directly against PostgreSQL, deploys through PgBouncer, starts
the dedicated tunnel, and performs public health checks:

```bash
./ops/deploy-vps.sh
```

On a new empty deployment only:

```bash
SKIP_PREDEPLOY_BACKUP=true ./ops/deploy-vps.sh
```

If the VPS already contains the legacy AllShops PostgreSQL container, the deploy
script stops before changing runtime services. Run the one-time migration; it
creates and verifies a custom-format source dump, requires an empty destination,
compares public table counts, and leaves the old container and volume intact:

```bash
./ops/migrate-allshops-to-shared-postgres.sh
./ops/deploy-vps.sh
```

Database migration does not include product images. When moving between hosts,
archive the named `allshops-production_product_images` volume on the source,
copy the archive over SSH, and extract it into the same named volume on the
destination before starting the API. Verify the archive and destination file
count; never delete the source volume as part of the transfer.

```bash
# Source host
docker run --rm -v allshops-production_product_images:/from:ro \
  -v "$PWD":/transfer alpine:3.22 \
  tar -C /from -czf /transfer/allshops-product-images.tgz .
sha256sum allshops-product-images.tgz > allshops-product-images.tgz.sha256

# Destination host, after checksum verification
docker volume create allshops-production_product_images
docker run --rm -v allshops-production_product_images:/to \
  -v "$PWD":/transfer:ro alpine:3.22 \
  tar -C /to -xzf /transfer/allshops-product-images.tgz
```

The equivalent package scripts are:

```bash
pnpm docker:production:config
pnpm docker:production:build
pnpm docker:production:deploy
```

## 4. Verify

```bash
docker compose --env-file ops/vps-production.env -f docker-compose.prod.yml ps
docker compose --env-file ops/vps-production.env -f docker-compose.prod.yml logs --tail=100 migrate api worker web
/opt/infrastructure/postgres/bin/monitor.sh
curl --fail https://api.allshopspos.com/api/v1/health/ready
curl --fail https://allshopspos.com/login
curl --fail https://www.allshopspos.com/login
SMOKE_BASE_URL=https://allshopspos.com pnpm smoke:production
```

Also verify login, one non-financial test record, Paystack test/live-mode separation, offline synchronization, branch restrictions, report totals, and an actual restore drill before accepting customer money.

## 5. Backups

Configure an encrypted rclone destination in
`/opt/infrastructure/postgres/.env` as `OFFSITE_REMOTE`, then run a verified
backup and isolated restore drill before enabling the nightly timer:

```bash
/opt/infrastructure/postgres/bin/backup-databases.sh allshops_db
/opt/infrastructure/postgres/bin/create-app-db.sh allshops_restore_test
/opt/infrastructure/postgres/bin/restore-test.sh \
  /opt/infrastructure/postgres/backups/allshops_db/daily/FILE.dump \
  allshops_restore_test_db
sudo /opt/infrastructure/postgres/bin/install-backup-timer.sh
```

The timer keeps 7 daily, 4 weekly and 3 monthly copies and fails if the offsite
copy fails. A same-host backup is not disaster recovery. Continue quarterly
restore drills and review `/var/log/shared-postgres-backup.log`.

## 6. Updates and rollback

Before every update, set `IMAGE_TAG`, `APP_VERSION`, `GIT_SHA`, and `BUILD_TIME` to immutable release values, then run `./ops/deploy-vps.sh`. Never use `prisma migrate dev` or `db push` in production.

For rollback, restore the prior Git tag/image tag and redeploy. Do not roll application code backward over an incompatible schema migration; use the reviewed forward-recovery migration or restore the pre-deployment database backup.

## Client handoff

Give the client only the two URLs and their tenant administrator login. Keep Docker, database credentials, Paystack secrets, SSH access, and Cloudflare administrator access with the designated technical owner. Establish named contacts for billing, support, security incidents, and domain renewal before launch.
