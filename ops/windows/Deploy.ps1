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

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][scriptblock]$Command
  )

  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE."
  }
}

function Wait-HttpReady {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [int]$TimeoutSeconds = 60
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 5
      if ($response.StatusCode -eq 200) { return $response }
    } catch {
      if ((Get-Date) -ge $deadline) { throw }
      Start-Sleep -Seconds 2
    }
  } while ((Get-Date) -lt $deadline)

  throw "Timed out waiting for $Uri."
}

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
  if ($LASTEXITCODE -ne 0) { throw 'pnpm installation failed.' }
}

$services = @('AllShopsApi', 'AllShopsWorker', 'AllShopsWeb')
$installed = @($services | Where-Object { Get-Service -Name $_ -ErrorAction SilentlyContinue })
$servicesInstalled = $installed.Count -eq $services.Count
$servicesStopped = $false
$deploymentComplete = $false

try {
  if ($servicesInstalled) {
    Write-Host 'Stopping AllShops application services to release build files.'
    $servicesStopped = $true
    foreach ($service in $services) {
      $current = Get-Service -Name $service
      if ($current.Status -ne 'Stopped') {
        Stop-Service -Name $service -Force
        $current.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30))
      }
    }
  }

  Invoke-CheckedCommand 'Dependency installation' { pnpm.cmd install --frozen-lockfile }
  Invoke-CheckedCommand 'Prisma client generation' { pnpm.cmd db:generate }
  Invoke-CheckedCommand 'Redis protocol preflight' { node ops/windows/Test-Redis.mjs }
  Invoke-CheckedCommand 'Application build' { pnpm.cmd build }
  Invoke-CheckedCommand 'Database migration' { pnpm.cmd db:migrate }
  Invoke-CheckedCommand 'Database seed' { pnpm.cmd db:seed }

  $deploymentComplete = $true
} finally {
  if ($servicesInstalled -and $servicesStopped) {
    Write-Host 'Starting AllShops application services.'
    foreach ($service in $services) {
      $current = Get-Service -Name $service
      if ($current.Status -ne 'Running') {
        Start-Service -Name $service
      }
    }
  }
}

if (-not $deploymentComplete) {
  throw 'Deployment failed before readiness verification. Review the error above and service logs.'
}

if ($servicesInstalled) {
  $api = Wait-HttpReady -Uri 'http://127.0.0.1:4000/api/v1/health/ready'
  $web = Wait-HttpReady -Uri 'http://127.0.0.1:3000/login'
  Write-Host "AllShops $env:GIT_SHA deployed and healthy."
} else {
  Write-Host "AllShops $env:GIT_SHA built and migrated. Install the Windows services to complete first deployment."
}
