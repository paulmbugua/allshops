[CmdletBinding()]
param(
  [string]$PosUrl = 'https://allshops.ekazi.co.ke/pos',
  [ValidateSet('Chrome', 'Edge')]
  [string]$Browser = 'Chrome'
)

$ErrorActionPreference = 'Stop'

$candidates = if ($Browser -eq 'Chrome') {
  @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
  )
} else {
  @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  )
}

$browserPath = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $browserPath) {
  throw "$Browser was not found. Install it or run this script with -Browser Edge."
}

Write-Host "Opening AllShops POS in silent-print kiosk mode."
Write-Host "Printer: the Windows default printer for this cashier account."
Start-Process -FilePath $browserPath -ArgumentList @(
  '--kiosk',
  '--kiosk-printing',
  '--no-first-run',
  '--disable-pinch',
  "--app=$PosUrl"
)
