#Requires -RunAsAdministrator
param(
  [string]$NssmPath = 'C:\Tools\nssm\nssm.exe',
  [string]$CaddyPath = 'C:\Tools\caddy\caddy.exe',
  [string]$EnvironmentFile = 'C:\ProgramData\AllShops\production.env',
  [string]$NodePath = ''
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$powershell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$logs = 'C:\AllShops\logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null

if (-not (Test-Path -LiteralPath $NssmPath)) { throw "NSSM not found: $NssmPath" }
if (-not (Test-Path -LiteralPath $CaddyPath)) { throw "Caddy not found: $CaddyPath" }
if (-not (Test-Path -LiteralPath $EnvironmentFile)) { throw "Environment file not found: $EnvironmentFile" }
if (-not $NodePath) { $NodePath = (Get-Command node.exe -ErrorAction Stop).Source }
if (-not (Test-Path -LiteralPath $NodePath)) { throw "Node.js not found: $NodePath" }

function Install-AllShopsService($name, $script) {
  if (Get-Service -Name $name -ErrorAction SilentlyContinue) {
    & $NssmPath stop $name confirm | Out-Null
    & $NssmPath remove $name confirm | Out-Null
  }
  & $NssmPath install $name $powershell "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
  & $NssmPath set $name AppDirectory $repo
  & $NssmPath set $name AppEnvironmentExtra "ALLSHOPS_ENV_FILE=$EnvironmentFile" "ALLSHOPS_NODE_PATH=$NodePath"
  & $NssmPath set $name AppStdout (Join-Path $logs "$name.log")
  & $NssmPath set $name AppStderr (Join-Path $logs "$name-error.log")
  & $NssmPath set $name AppRotateFiles 1
  & $NssmPath set $name AppRotateBytes 10485760
  & $NssmPath set $name Start SERVICE_AUTO_START
}

Install-AllShopsService 'AllShopsApi' (Join-Path $PSScriptRoot 'Start-Api.ps1')
Install-AllShopsService 'AllShopsWorker' (Join-Path $PSScriptRoot 'Start-Worker.ps1')
Install-AllShopsService 'AllShopsWeb' (Join-Path $PSScriptRoot 'Start-Web.ps1')

if (Get-Service -Name 'AllShopsCaddy' -ErrorAction SilentlyContinue) {
  & $NssmPath stop AllShopsCaddy confirm | Out-Null
  & $NssmPath remove AllShopsCaddy confirm | Out-Null
}
& $NssmPath install AllShopsCaddy $CaddyPath "run --config `"$(Join-Path $PSScriptRoot 'Caddyfile')`" --adapter caddyfile"
& $NssmPath set AllShopsCaddy AppDirectory $repo
& $NssmPath set AllShopsCaddy AppStdout (Join-Path $logs 'caddy.log')
& $NssmPath set AllShopsCaddy AppStderr (Join-Path $logs 'caddy-error.log')
& $NssmPath set AllShopsCaddy Start SERVICE_AUTO_START

foreach ($name in 'AllShopsApi', 'AllShopsWorker', 'AllShopsWeb', 'AllShopsCaddy') {
  Start-Service -Name $name
}
Get-Service AllShopsApi, AllShopsWorker, AllShopsWeb, AllShopsCaddy
