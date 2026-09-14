param(
  [string]$InstallDirectory = 'C:\Tools\caddy',
  [string]$Version = '2.11.4'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this script from an elevated Windows PowerShell window.'
}

$trustedHashes = @{
  '2.11.4' = 'cd5ccfd86a4b40732cf715890d0dca5bf3f63adefec5a7914de85adf240c60ce7e5d2791631b88ef9758e46b23bb1730e020b9c5d696889740b284ffd4788e35'
}
if (-not $trustedHashes.ContainsKey($Version)) {
  throw "No trusted SHA-512 is registered for Caddy $Version. Review the official release before updating this script."
}

$asset = "caddy_${Version}_windows_amd64.zip"
$download = "https://github.com/caddyserver/caddy/releases/download/v$Version/$asset"
$temporary = Join-Path ([IO.Path]::GetTempPath()) ("allshops-caddy-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $temporary | Out-Null

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $archive = Join-Path $temporary $asset
  Invoke-WebRequest -UseBasicParsing -Uri $download -OutFile $archive
  $actualHash = (Get-FileHash -Algorithm SHA512 -LiteralPath $archive).Hash.ToLowerInvariant()
  if ($actualHash -ne $trustedHashes[$Version]) {
    throw "Caddy archive integrity check failed. Expected $($trustedHashes[$Version]); received $actualHash."
  }

  $expanded = Join-Path $temporary 'expanded'
  Expand-Archive -LiteralPath $archive -DestinationPath $expanded
  $source = Get-ChildItem -LiteralPath $expanded -Filter caddy.exe -Recurse | Select-Object -First 1
  if (-not $source) { throw 'caddy.exe was not present in the official archive.' }

  New-Item -ItemType Directory -Force -Path $InstallDirectory | Out-Null
  $destination = Join-Path $InstallDirectory 'caddy.exe'
  Copy-Item -LiteralPath $source.FullName -Destination $destination -Force

  $caddyfile = Join-Path $PSScriptRoot 'Caddyfile'
  & $destination validate --config $caddyfile --adapter caddyfile
  if ($LASTEXITCODE -ne 0) { throw 'Caddyfile validation failed.' }

  foreach ($port in 80,443) {
    $name = "AllShops - HTTPS ingress $port"
    if (-not (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue)) {
      New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Any | Out-Null
    }
  }

  Write-Host "Caddy $Version is installed, verified, and configured for TCP 80/443."
  & $destination version
} finally {
  Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue
}
