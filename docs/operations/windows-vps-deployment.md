# Windows Server 2022 VPS deployment

This is the native deployment path for a Windows Server 2022 host without
Docker. It uses the installed PostgreSQL server, a Redis-compatible service,
Node.js, NSSM-managed application services, and Caddy for automatic HTTPS.

## Required services

- Node.js matching the repository CI version where possible (22.14.0); Node 24
  may be used only after the complete build and smoke test pass on the VPS.
- PostgreSQL 17 with its `bin` directory available, or discoverable below
  `C:\Program Files\PostgreSQL`.
- Microsoft .NET Runtime 10 for Garnet. `Install-Garnet.ps1` installs it from
  Microsoft's official installer when it is absent.
- Redis-compatible storage on `127.0.0.1:6379`. The included installer uses the
  stable Microsoft Garnet 1.1 release on Windows, enables password
  authentication and append-only recovery, and verifies the Redis commands
  required by AllShops. Memurai Enterprise or a managed Redis service may be
  substituted. Do not use the abandoned Redis 5 Windows port.
- Git, Caddy, and NSSM.

PostgreSQL and Redis must listen only on loopback or a private interface. Public
firewall access is limited to TCP 80 and 443 (and RDP restricted to the
administrator's fixed IP or VPN). Ports 3000, 4000, 4001, 5432, and 6379 must
not be public.

## First deployment

Run in an elevated Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force C:\AllShops,C:\AllShops\backups,C:\AllShops\logs,C:\ProgramData\AllShops
Set-Location C:\AllShops
git clone https://github.com/paulmbugua/allshops.git app
Set-Location C:\AllShops\app
npm install --global pnpm@10.15.0
pnpm install --frozen-lockfile

powershell -ExecutionPolicy Bypass -File ops\windows\Test-Prerequisites.ps1

Copy-Item ops\windows\vps-production.env.example C:\ProgramData\AllShops\production.env
notepad C:\ProgramData\AllShops\production.env
```

Replace every `REPLACE_` value. `DATABASE_URL` uses the existing PostgreSQL
server. Create the role/database with pgAdmin or `psql.exe`:

```sql
CREATE ROLE allshops LOGIN PASSWORD 'A_URL_SAFE_RANDOM_PASSWORD';
CREATE DATABASE allshops OWNER allshops;
```

Give the environment file a restricted ACL:

```powershell
icacls C:\ProgramData\AllShops\production.env /inheritance:r
icacls C:\ProgramData\AllShops\production.env /grant:r "Administrators:F" "SYSTEM:R"
```

For the self-hosted Windows cache, set `REDIS_URL` to
`redis://:URL_ENCODED_PASSWORD@127.0.0.1:6379`. Use a unique password of at
least 32 characters. Then replace any legacy Redis process with authenticated
Microsoft Garnet (NSSM must already be at `C:\Tools\nssm\nssm.exe`):

```powershell
powershell -ExecutionPolicy Bypass -File ops\windows\Install-Garnet.ps1
Get-Service AllShopsGarnet
```

The installer pins and verifies the official release archive checksum, binds
only to loopback, enables AOF recovery and Lua, protects the configuration ACL,
uses a bounded 256 MB main cache instead of Garnet's server-sized default,
installs an automatic Windows service, and runs a protocol preflight. Garnet is
not a universal Redis replacement; the preflight deliberately covers the data
types and scripting AllShops is prepared to use. Expand that test before adding
new queue primitives.

Ensure Cloudflare proxied `A` records for `allshops.ekazi.co.ke` and
`api.ekazi.co.ke` point to the VPS. Use Full (strict) SSL mode and bypass cache
for both API paths.

Place `caddy.exe` at `C:\Tools\caddy\caddy.exe` and `nssm.exe` at
`C:\Tools\nssm\nssm.exe`. Validate and build:

```powershell
powershell -ExecutionPolicy Bypass -File ops\windows\Deploy.ps1 -SkipBackup
powershell -ExecutionPolicy Bypass -File ops\windows\Install-Services.ps1
```

`-SkipBackup` is permitted only for the first empty database. Every later
deployment creates and validates a PostgreSQL custom-format backup first.

## Verify

```powershell
Get-Service AllShopsGarnet,AllShopsApi,AllShopsWorker,AllShopsWeb,AllShopsCaddy
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4000/api/v1/health/ready
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/login
Invoke-WebRequest -UseBasicParsing https://api.ekazi.co.ke/api/v1/health/ready
Invoke-WebRequest -UseBasicParsing https://allshops.ekazi.co.ke/login
Get-Content C:\AllShops\logs\AllShopsApi-error.log -Tail 100
```

Complete login, Paystack subscription checkout, branch authorization, one test
sale, receipt, report totals, and offline sync verification before onboarding a
merchant.

## Updates

```powershell
Set-Location C:\AllShops\app
powershell -ExecutionPolicy Bypass -File ops\windows\Deploy.ps1
```

Never use `prisma migrate dev` or `prisma db push` on the VPS. Copy backups to
encrypted off-host storage; a backup left only on the same VPS is not disaster
recovery.
