$ErrorActionPreference = 'Stop'

function Get-ToolVersion($command, $argument) {
  $tool = Get-Command $command -ErrorAction SilentlyContinue
  if (-not $tool) { return 'MISSING' }
  return (& $tool.Source $argument 2>$null)
}

$checks = [ordered]@{
  OperatingSystem = (Get-CimInstance Win32_OperatingSystem).Caption
  Git = Get-ToolVersion 'git.exe' '--version'
  Node = Get-ToolVersion 'node.exe' '--version'
  Pnpm = Get-ToolVersion 'pnpm.cmd' '--version'
}

$dotnet = 'C:\Program Files\dotnet\dotnet.exe'
$checks.DotNet10Runtime = if (Test-Path -LiteralPath $dotnet) {
  $matchingRuntime = @(& $dotnet --list-runtimes 2>$null) |
    Where-Object { $_ -match '^Microsoft\.NETCore\.App 10\.' }
  if ($matchingRuntime) { $matchingRuntime -join ', ' } else { 'MISSING' }
} else { 'MISSING' }
$caddy = 'C:\Tools\caddy\caddy.exe'
$checks.Caddy = if (Test-Path -LiteralPath $caddy) {
  (& $caddy version 2>$null)
} else { 'MISSING' }

$psql = Get-Command psql.exe -ErrorAction SilentlyContinue
if (-not $psql) {
  $psql = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1
}
$checks.PostgreSQLClient = if ($psql) {
  $path = if ($psql.PSObject.Properties['Source']) { $psql.Source } else { $psql.FullName }
  (& $path --version)
} else { 'MISSING' }
$checks.PostgreSQLService = @(
  Get-Service -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'postgres' } |
    Select-Object -ExpandProperty Status
) -join ', '
$checks.RedisPort6379 = (Test-NetConnection 127.0.0.1 -Port 6379 -InformationLevel Quiet)
$checks.WebPort3000 = (Test-NetConnection 127.0.0.1 -Port 3000 -InformationLevel Quiet)
$checks.ApiPort4000 = (Test-NetConnection 127.0.0.1 -Port 4000 -InformationLevel Quiet)
$checks.HttpsPort443 = (Test-NetConnection 127.0.0.1 -Port 443 -InformationLevel Quiet)

[pscustomobject]$checks | Format-List

if (-not $psql) { Write-Warning 'PostgreSQL exists but its client was not found. Locate the PostgreSQL installation before deployment.' }
if ($checks.DotNet10Runtime -eq 'MISSING') { Write-Warning '.NET Runtime 10 is required by the Windows Garnet service; Install-Garnet.ps1 can install it.' }
if (-not $checks.RedisPort6379) { Write-Warning 'A Redis-compatible service is required before AllShops can start.' }
