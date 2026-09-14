param(
  [string]$DeviceId,
  [int]$ApiPort = 4000,
  [string]$FlutterRoot = "C:\dev\flutter",
  [switch]$AttachInstalled
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$mobileRoot = Join-Path $repoRoot "apps\mobile"
$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
$dart = Join-Path $FlutterRoot "bin\cache\dart-sdk\bin\dart.exe"
$flutterSnapshot = Join-Path $FlutterRoot "bin\cache\flutter_tools.snapshot"
$windowsPowerShell = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0"

foreach ($requiredFile in @($adb, $dart, $flutterSnapshot)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Required development tool was not found: $requiredFile"
  }
}

if (-not (Get-NetTCPConnection -LocalPort $ApiPort -State Listen -ErrorAction SilentlyContinue)) {
  throw "The AllShops API is not listening on port $ApiPort. Run 'docker compose up -d' and 'pnpm dev' from $repoRoot first."
}

if (-not $DeviceId) {
  $DeviceId = (& $adb devices) |
    Select-String -Pattern '^([^\s]+)\s+device$' |
    ForEach-Object { $_.Matches[0].Groups[1].Value } |
    Select-Object -First 1
}
if (-not $DeviceId) {
  throw "No authorized physical Android device was found. Enable USB debugging and accept the authorization prompt on the device."
}

# Some Windows hosts expose an inaccessible pwsh.exe earlier in PATH. Flutter's
# nested Gradle invocation detects it and reports the misleading error
# "PowerShell executable not found". Remove Codex runtime entries and put the
# built-in Windows PowerShell directory first for this process tree only.
$cleanPath = $env:Path -split ';' |
  Where-Object { $_ -and $_ -notmatch '\\.cache\\codex-runtimes\\' }
$env:Path = (@($windowsPowerShell, "$env:WINDIR\System32") + $cleanPath) -join ';'

& $adb -s $DeviceId reverse "tcp:$ApiPort" "tcp:$ApiPort"
if ($LASTEXITCODE -ne 0) { throw "Unable to configure USB API forwarding for $DeviceId." }

$apiUrl = "http://127.0.0.1:$ApiPort/api/v1"
Write-Host "USB API endpoint: $apiUrl"

if ($AttachInstalled) {
  $debugPackage = "com.allshops.pos.debug"
  $installed = & $adb -s $DeviceId shell pm list packages $debugPackage
  if ($installed -notmatch "package:$([regex]::Escape($debugPackage))") {
    throw "AllShops POS Dev is not installed. Install Downloads/AllShops-POS-Dev.apk on the phone first."
  }
  Write-Host "Opening the installed AllShops POS Dev app on $DeviceId"
  & $adb -s $DeviceId shell monkey -p $debugPackage 1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Unable to open $debugPackage on $DeviceId." }
  Start-Sleep -Seconds 2
}

Push-Location $mobileRoot
try {
  $maximumAttempts = 3
  for ($attempt = 1; $attempt -le $maximumAttempts; $attempt++) {
    if ($AttachInstalled) {
      & $dart $flutterSnapshot attach -d $DeviceId --app-id com.allshops.pos.debug
    } else {
      Write-Host "Building and launching AllShops POS Dev on $DeviceId"
      & $dart $flutterSnapshot run -d $DeviceId "--dart-define=ALLSHOPS_API_URL=$apiUrl"
    }
    $exitCode = $LASTEXITCODE
    if ($exitCode -eq 0) { exit 0 }

    # Gradle may return 1 when a nested flutter.bat process terminates with the
    # Windows access-violation code, so both forms receive bounded retries.
    if ($exitCode -in @(-1073741819, 1) -and $attempt -lt $maximumAttempts) {
      Write-Warning "The Windows Flutter/Gradle process failed (exit $exitCode). Retrying launch ($($attempt + 1)/$maximumAttempts)."
      continue
    }
    exit $exitCode
  }
} finally {
  Pop-Location
}
