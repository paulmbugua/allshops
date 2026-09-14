$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
. (Join-Path $PSScriptRoot 'Import-Environment.ps1')
Set-Location $repo
$env:WORKER_HEALTH_PORT = '4001'
& (Get-Command node.exe -ErrorAction Stop).Source 'apps/worker/dist/main.js'
exit $LASTEXITCODE
