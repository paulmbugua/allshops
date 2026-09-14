$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
. (Join-Path $PSScriptRoot 'Import-Environment.ps1')
Set-Location $repo
$env:PORT = '4000'
if (-not $env:PRODUCT_IMAGE_DIRECTORY) {
  $env:PRODUCT_IMAGE_DIRECTORY = 'C:\AllShops\data\product-images'
}
$node = if ($env:ALLSHOPS_NODE_PATH) { $env:ALLSHOPS_NODE_PATH } else { (Get-Command node.exe -ErrorAction Stop).Source }
& $node 'apps/api/dist/main.js'
exit $LASTEXITCODE
