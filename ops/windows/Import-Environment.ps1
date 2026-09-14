param(
  [string]$EnvironmentFile = $(
    if ($env:ALLSHOPS_ENV_FILE) { $env:ALLSHOPS_ENV_FILE }
    else { 'C:\ProgramData\AllShops\production.env' }
  )
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $EnvironmentFile -PathType Leaf)) {
  throw "AllShops environment file not found: $EnvironmentFile"
}

foreach ($line in Get-Content -LiteralPath $EnvironmentFile) {
  $trimmed = $line.Trim()
  if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
  $parts = $trimmed.Split('=', 2)
  if ($parts.Count -ne 2 -or -not $parts[0].Trim()) {
    throw "Invalid environment entry: $line"
  }
  $name = $parts[0].Trim()
  $value = $parts[1].Trim()
  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  [Environment]::SetEnvironmentVariable($name, $value, 'Process')
}

$required = @(
  'DATABASE_URL', 'REDIS_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET',
  'APP_URL', 'API_URL', 'CORS_ORIGINS', 'NODE_ENV'
)
$missing = @($required | Where-Object { -not [Environment]::GetEnvironmentVariable($_, 'Process') })
if ($missing.Count -gt 0) {
  throw "Missing production environment values: $($missing -join ', ')"
}
if (Select-String -LiteralPath $EnvironmentFile -Pattern 'REPLACE_' -Quiet) {
  throw "The production environment still contains REPLACE_ placeholders."
}
