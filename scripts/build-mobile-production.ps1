param(
  [string]$ApiUrl = "https://api.ekazi.co.ke/api/v1",
  [switch]$AlsoBuildApk,
  [switch]$SkipChecks
)

$ErrorActionPreference = "Stop"
$mobileRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\apps\mobile")).Path
$flutterPath = if (Get-Command flutter -ErrorAction SilentlyContinue) {
  (Get-Command flutter).Source
} elseif (Test-Path "C:\dev\flutter\bin\flutter.bat") {
  "C:\dev\flutter\bin\flutter.bat"
} else {
  throw "Flutter was not found in PATH or at C:\dev\flutter\bin\flutter.bat."
}
$flutterRoot = Split-Path (Split-Path $flutterPath -Parent) -Parent
$dart = Join-Path $flutterRoot "bin\cache\dart-sdk\bin\dart.exe"
$flutterSnapshot = Join-Path $flutterRoot "bin\cache\flutter_tools.snapshot"
if (-not (Test-Path $dart) -or -not (Test-Path $flutterSnapshot)) {
  throw "Flutter's Dart SDK/tool snapshot is incomplete. Run flutter doctor before building."
}
$keyProperties = Join-Path $mobileRoot "android\key.properties"
$platform = Join-Path $env:LOCALAPPDATA "Android\Sdk\platforms\android-36\android.jar"
$versionLine = Select-String -Path (Join-Path $mobileRoot "pubspec.yaml") -Pattern '^version:\s*(\S+)' | Select-Object -First 1
if (-not $versionLine) { throw "No version was found in apps/mobile/pubspec.yaml." }
$releaseVersion = $versionLine.Matches[0].Groups[1].Value
$symbols = Join-Path $mobileRoot "build\symbols\$releaseVersion"

if (-not (Test-Path $keyProperties)) {
  throw "Missing android/key.properties. Copy key.properties.example and configure the private upload keystore."
}
if (-not (Test-Path $platform)) {
  throw "Android SDK Platform 36 is missing. Install Android SDK Platform 36 in Android Studio's SDK Manager."
}
if (-not $ApiUrl.StartsWith("https://")) {
  throw "Production API URL must use HTTPS."
}

function Invoke-FlutterChecked {
  param(
    [Parameter(Mandatory = $true)][string]$Step,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [int]$AccessViolationRetries = 0,
    [switch]$RetryBuildExitOne
  )

  $attempt = 0
  while ($true) {
    $attempt++
    & $dart $flutterSnapshot @Arguments
    $exitCode = $LASTEXITCODE
    if ($exitCode -eq 0) { return }
    $knownProcessFault = $exitCode -in @(-1073741819, -1) -or
      ($RetryBuildExitOne -and $exitCode -eq 1)
    if ($knownProcessFault -and $attempt -le $AccessViolationRetries) {
      Write-Warning "$Step was interrupted by the known Windows process-launch fault (exit $exitCode); retrying ($attempt/$($AccessViolationRetries + 1))."
      continue
    }
    throw "$Step failed with exit code $exitCode."
  }
}

Push-Location $mobileRoot
try {
  # Calling the tool snapshot directly avoids an intermittent Windows batch
  # subprocess crash observed when flutter.bat launches test/build commands.
  Invoke-FlutterChecked -Step "flutter pub get" -Arguments @("pub", "get") -AccessViolationRetries 2
  & $dart run flutter_launcher_icons
  if ($LASTEXITCODE -ne 0) { throw "launcher icon generation failed." }
  if (-not $SkipChecks) {
    Invoke-FlutterChecked -Step "flutter analyze" -Arguments @("analyze") -AccessViolationRetries 2
    Invoke-FlutterChecked -Step "flutter test" -Arguments @("test") -AccessViolationRetries 2
  } else {
    Write-Warning "Static analysis and tests were skipped. Use this only after both passed independently for the exact source revision."
  }
} finally {
  Pop-Location
}

# Kotlin incremental compilation is unreliable when Pub/Flutter are on C: and
# the project is on E:. Build from a fresh same-drive staging tree, then copy
# only the signed artifacts and private obfuscation symbols back to the repo.
$stagingRoot = Join-Path ([IO.Path]::GetTempPath()) "allshops-mobile-release-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null
try {
  & robocopy $mobileRoot $stagingRoot /E /XD build .dart_tool | Out-Null
  if ($LASTEXITCODE -gt 7) { throw "Unable to create the mobile release staging tree (robocopy exit $LASTEXITCODE)." }

  $stageSymbols = Join-Path $stagingRoot "build\symbols\$releaseVersion"
  Push-Location $stagingRoot
  try {
    Invoke-FlutterChecked -Step "staged flutter pub get" -Arguments @("pub", "get") -AccessViolationRetries 2
    Invoke-FlutterChecked -Step "Play Store app bundle build" -Arguments @(
      "build", "appbundle", "--release", "--target-platform", "android-arm64", "--obfuscate",
      "--split-debug-info=$stageSymbols",
      "--dart-define=ALLSHOPS_API_URL=$ApiUrl"
    ) -AccessViolationRetries 2 -RetryBuildExitOne
    if ($AlsoBuildApk) {
      Invoke-FlutterChecked -Step "release APK build" -Arguments @(
        "build", "apk", "--release", "--target-platform", "android-arm64",
        "--obfuscate", "--split-debug-info=$stageSymbols",
        "--dart-define=ALLSHOPS_API_URL=$ApiUrl"
      ) -AccessViolationRetries 2 -RetryBuildExitOne
    }
  } finally {
    Pop-Location
  }

  $bundleDestination = Join-Path $mobileRoot "build\app\outputs\bundle\release"
  New-Item -ItemType Directory -Force -Path $bundleDestination | Out-Null
  Copy-Item -LiteralPath (Join-Path $stagingRoot "build\app\outputs\bundle\release\app-release.aab") -Destination $bundleDestination -Force
  if ($AlsoBuildApk) {
    $apkDestination = Join-Path $mobileRoot "build\app\outputs\flutter-apk"
    New-Item -ItemType Directory -Force -Path $apkDestination | Out-Null
    Copy-Item -LiteralPath (Join-Path $stagingRoot "build\app\outputs\flutter-apk\app-release.apk") -Destination $apkDestination -Force
  }
  New-Item -ItemType Directory -Force -Path $symbols | Out-Null
  Copy-Item -Path (Join-Path $stageSymbols "*") -Destination $symbols -Recurse -Force
} finally {
  $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  $resolvedStage = [IO.Path]::GetFullPath($stagingRoot)
  if ($resolvedStage.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and
      (Split-Path $resolvedStage -Leaf).StartsWith("allshops-mobile-release-")) {
    Remove-Item -LiteralPath $resolvedStage -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "Google Play bundle: apps/mobile/build/app/outputs/bundle/release/app-release.aab"
Write-Host "Keep the matching symbols directory private: apps/mobile/build/symbols/$releaseVersion"
