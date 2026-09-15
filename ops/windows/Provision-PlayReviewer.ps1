param(
  [string]$Email = 'reviewer@gmail.com',
  [SecureString]$Password,
  [string]$EnvironmentFile = 'C:\ProgramData\AllShops\production.env'
)

$ErrorActionPreference = 'Stop'

if (-not $Password) {
  $Password = Read-Host 'Google Play reviewer password' -AsSecureString
}

& (Join-Path $PSScriptRoot 'Import-Environment.ps1') -EnvironmentFile $EnvironmentFile

$credential = New-Object System.Management.Automation.PSCredential($Email, $Password)
$env:PLAY_REVIEWER_EMAIL = $Email
$env:PLAY_REVIEWER_PASSWORD = $credential.GetNetworkCredential().Password

try {
  Push-Location (Resolve-Path (Join-Path $PSScriptRoot '..\..'))
  try {
    node apps/api/scripts/provision-play-reviewer.mjs
    if ($LASTEXITCODE -ne 0) {
      throw "Reviewer provisioning failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
} finally {
  Remove-Item Env:PLAY_REVIEWER_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:PLAY_REVIEWER_PASSWORD -ErrorAction SilentlyContinue
}
