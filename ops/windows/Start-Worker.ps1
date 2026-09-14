$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
. (Join-Path $PSScriptRoot 'Import-Environment.ps1')
Set-Location $repo
$env:WORKER_HEALTH_PORT = '4001'
$node = if ($env:ALLSHOPS_NODE_PATH) { $env:ALLSHOPS_NODE_PATH } else { (Get-Command node.exe -ErrorAction Stop).Source }
& $node 'apps/worker/dist/main.js'
exit $LASTEXITCODE
