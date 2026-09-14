$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
. (Join-Path $PSScriptRoot 'Import-Environment.ps1')
Set-Location $repo
$env:PORT = '3000'
$next = Join-Path $repo 'apps\web\node_modules\next\dist\bin\next'
& (Get-Command node.exe -ErrorAction Stop).Source $next start apps/web -p 3000
exit $LASTEXITCODE
