param(
  [string]$DeviceId,
  [switch]$Clear
)

$ErrorActionPreference = "Stop"
$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path -LiteralPath $adb -PathType Leaf)) {
  throw "ADB was not found: $adb"
}

if (-not $DeviceId) {
  $DeviceId = (& $adb devices) |
    Select-String -Pattern '^([^\s]+)\s+device$' |
    ForEach-Object { $_.Matches[0].Groups[1].Value } |
    Select-Object -First 1
}
if (-not $DeviceId) {
  throw "No authorized physical Android device was found."
}

if ($Clear) { & $adb -s $DeviceId logcat -c }

Write-Host "Watching AllShops logs on $DeviceId. Press Ctrl+C to stop."
& $adb -s $DeviceId logcat -v time |
  Select-String -SimpleMatch "ALLSHOPS"
