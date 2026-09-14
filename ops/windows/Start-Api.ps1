$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
. (Join-Path $PSScriptRoot 'Import-Environment.ps1')
Set-Location $repo
$env:PORT = '4000'
& (Get-Command node.exe -ErrorAction Stop).Source 'apps/api/dist/main.js'
exit $LASTEXITCODE
