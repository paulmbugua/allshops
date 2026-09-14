# AllShops production rollout

## Chosen topology

AllShops uses Docker on one Ubuntu VPS for the initial production rollout. This keeps the Next.js client, NestJS API, worker, PostgreSQL, Redis, migrations, backup tooling, and TLS edge versioned together:

- `https://allshops.ekazi.co.ke` — customer web application
- `https://allshops.ekazi.co.ke/api/v1/*` — same-origin browser API proxy
- `https://api.ekazi.co.ke/api/v1/*` — public API for Flutter and integrations
- Caddy — automatic HTTPS and reverse proxy
- Next.js — private container port 3000
- NestJS API — private container port 4000
- PostgreSQL 17 and Redis 7.4 — isolated Docker network, no public host ports
- Worker — private data network
- One-shot migration container — must finish successfully before API/worker start

Cloudflare Workers and Wrangler are deliberately not used. The web application is a stateful Next.js server and the backend already requires a VPS; putting the web container beside it is simpler, avoids a second runtime adapter, and preserves the tested standalone Next.js output. Cloudflare remains valuable as proxied DNS, DDoS/WAF protection, and the public edge.

## 1. Prepare Cloudflare DNS

Create two proxied `A` records in the `ekazi.co.ke` zone:

| Type | Name       | Target          | Proxy   |
| ---- | ---------- | --------------- | ------- |
| A    | `allshops` | VPS public IPv4 | Proxied |
| A    | `api`      | VPS public IPv4 | Proxied |

Set SSL/TLS mode to **Full (strict)**, enable Always Use HTTPS, and leave WebSockets enabled. Add a cache bypass rule for `api.ekazi.co.ke/*` and `allshops.ekazi.co.ke/api/*`; cache only immutable `/_next/static/*` assets. Do not expose ports 3000, 4000, 5432, or 6379 in the VPS firewall.

For the first certificate issuance, the two DNS records must already point at the VPS and inbound TCP 80/443 must be open. UDP 443 enables HTTP/3. Caddy stores certificates in the persistent `caddy_data` volume.

## 2. Prepare the VPS

Recommended starting size is Ubuntu 24.04 LTS, 4 vCPU, 8 GB RAM, 100 GB SSD, and a separate encrypted/off-host backup destination. Install Docker Engine with the Compose plugin, Git, and curl. Then:

```bash
sudo mkdir -p /opt/allshops
sudo chown "$USER":"$USER" /opt/allshops
git clone https://github.com/paulmbugua/allshops.git /opt/allshops
cd /opt/allshops
cp ops/vps-production.env.example ops/vps-production.env
chmod 600 ops/vps-production.env
```

Populate every `REPLACE_...` value. Generate independent URL-safe secrets, for example:

```bash
openssl rand -base64 48 | tr -d '/+=' | head -c 64; echo
```

The password embedded in `DATABASE_URL` must match `POSTGRES_PASSWORD`; the one embedded in `REDIS_URL` must match `REDIS_PASSWORD`. Keep passwords URL-safe or percent-encode them. Use the Paystack live secret only on the API container. Never place it in a `NEXT_PUBLIC_*` variable or in Flutter.

## 3. Build and deploy

These are the production build and deploy commands from `/opt/allshops`:

```bash
docker compose --env-file ops/vps-production.env -f docker-compose.prod.yml config --quiet
docker compose --env-file ops/vps-production.env -f docker-compose.prod.yml build --pull
docker compose --env-file ops/vps-production.env -f docker-compose.prod.yml up -d --remove-orphans
```

The shorter guarded rollout runs validation, image builds, a verified pre-deployment backup, migrations, deployment, and public health checks:

```bash
chmod +x ops/deploy-vps.sh ops/backup-postgres.sh
./ops/deploy-vps.sh
```

On the very first empty deployment only, where no data exists to back up:

```bash
SKIP_PREDEPLOY_BACKUP=true ./ops/deploy-vps.sh
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
docker compose --env-file ops/vps-production.env -f docker-compose.prod.yml logs --tail=100 migrate api worker web caddy
curl --fail https://api.ekazi.co.ke/api/v1/health/ready
curl --fail https://allshops.ekazi.co.ke/login
SMOKE_BASE_URL=https://allshops.ekazi.co.ke pnpm smoke:production
```

Also verify login, one non-financial test record, Paystack test/live-mode separation, offline synchronization, branch restrictions, report totals, and an actual restore drill before accepting customer money.

## 5. Backups

Run a verified backup immediately:

```bash
docker compose --env-file ops/vps-production.env -f docker-compose.prod.yml --profile operations run --rm backup
```

Schedule that command daily from root cron or a systemd timer and copy the `postgres_backups` volume off the VPS. A disk failure destroys both the live volume and same-host backups, so an encrypted off-host copy is mandatory. Follow `backups.md` and `disaster-recovery.md` for retention and quarterly restore tests.

## 6. Updates and rollback

Before every update, set `IMAGE_TAG`, `APP_VERSION`, `GIT_SHA`, and `BUILD_TIME` to immutable release values, then run `./ops/deploy-vps.sh`. Never use `prisma migrate dev` or `db push` in production.

For rollback, restore the prior Git tag/image tag and redeploy. Do not roll application code backward over an incompatible schema migration; use the reviewed forward-recovery migration or restore the pre-deployment database backup.

## Client handoff

Give the client only the two URLs and their tenant administrator login. Keep Docker, database credentials, Paystack secrets, SSH access, and Cloudflare administrator access with the designated technical owner. Establish named contacts for billing, support, security incidents, and domain renewal before launch.
