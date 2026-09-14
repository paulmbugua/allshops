param(
  [string]$EnvironmentFile = 'C:\ProgramData\AllShops\production.env',
  [string]$BackupDirectory = 'C:\AllShops\backups',
  [switch]$SkipBackup
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repo
. (Join-Path $PSScriptRoot 'Import-Environment.ps1') -EnvironmentFile $EnvironmentFile

if (git status --porcelain) {
  throw 'Deployment refused because the VPS repository has uncommitted changes.'
}

git fetch origin
git checkout main
git merge --ff-only origin/main

$env:GIT_SHA = (git rev-parse HEAD).Trim()
$env:BUILD_TIME = [DateTime]::UtcNow.ToString('o')
$env:NEXT_PUBLIC_API_URL = '/api/v1'

if (-not $SkipBackup) {
  New-Item -ItemType Directory -Force -Path $BackupDirectory | Out-Null
  $pgDump = Get-Command pg_dump.exe -ErrorAction SilentlyContinue
  if (-not $pgDump) {
    $pgDump = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_dump.exe' -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending | Select-Object -First 1
  }
  if (-not $pgDump) {
    throw 'pg_dump.exe was not found. Add PostgreSQL bin to PATH or use -SkipBackup only for the first empty deployment.'
  }
  $sourceProperty = $pgDump.PSObject.Properties['Source']
  $pgDumpPath = if ($sourceProperty) { $sourceProperty.Value } else { $pgDump.FullName }
  $databaseUrl = $env:DATABASE_URL -replace '\?schema=public$', ''
  $backup = Join-Path $BackupDirectory ("allshops-{0}.dump" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
  & $pgDumpPath --dbname=$databaseUrl --format=custom --file=$backup
  if ($LASTEXITCODE -ne 0 -or (Get-Item $backup).Length -lt 1024) {
    throw 'The pre-deployment PostgreSQL backup failed validation.'
  }
  Write-Host "Backup created: $backup"
}

if (-not (Get-Command pnpm.cmd -ErrorAction SilentlyContinue)) {
  npm install --global pnpm@10.15.0
}
pnpm.cmd install --frozen-lockfile
pnpm.cmd db:generate
pnpm.cmd build
pnpm.cmd db:migrate
pnpm.cmd db:seed

$services = @('AllShopsApi', 'AllShopsWorker', 'AllShopsWeb')
$installed = @($services | Where-Object { Get-Service -Name $_ -ErrorAction SilentlyContinue })
if ($installed.Count -eq $services.Count) {
  foreach ($service in $services) { Restart-Service -Name $service -Force }
  Start-Sleep -Seconds 5
  $api = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:4000/api/v1/health/ready'
  $web = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3000/login'
  if ($api.StatusCode -ne 200 -or $web.StatusCode -ne 200) {
    throw 'Local production readiness verification failed.'
  }
  Write-Host "AllShops $env:GIT_SHA deployed and healthy."
} else {
  Write-Host "AllShops $env:GIT_SHA built and migrated. Install the Windows services to complete first deployment."
}
