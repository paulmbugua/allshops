param(
  [string]$EnvironmentFile = 'C:\ProgramData\AllShops\production.env',
  [string]$InstallDirectory = 'C:\Tools\garnet',
  [string]$DataDirectory = 'C:\ProgramData\AllShops\garnet',
  [string]$Version = '1.1.10'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this script from an elevated Windows PowerShell window.'
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
. (Join-Path $PSScriptRoot 'Import-Environment.ps1') -EnvironmentFile $EnvironmentFile

if (-not $env:REDIS_URL) {
  throw 'REDIS_URL is missing from the production environment file.'
}

$redisUri = [Uri]$env:REDIS_URL
if ($redisUri.Scheme -ne 'redis') {
  throw 'Self-hosted Garnet requires a redis:// REDIS_URL.'
}
if ($redisUri.Host -notin @('127.0.0.1', 'localhost', '::1')) {
  throw 'Self-hosted Garnet REDIS_URL must use a loopback host.'
}

$userInfo = $redisUri.UserInfo
if (-not $userInfo -or -not $userInfo.Contains(':')) {
  throw 'Use REDIS_URL=redis://:URL_ENCODED_PASSWORD@127.0.0.1:6379 in the production environment file.'
}
$password = [Uri]::UnescapeDataString($userInfo.Substring($userInfo.IndexOf(':') + 1))
if ($password.Length -lt 32) {
  throw 'The Garnet password decoded from REDIS_URL must be at least 32 characters.'
}

$nssm = 'C:\Tools\nssm\nssm.exe'
if (-not (Test-Path -LiteralPath $nssm)) {
  throw "NSSM was not found at $nssm."
}

$asset = "win-x64-based-readytorun.zip"
$download = "https://github.com/microsoft/garnet/releases/download/v$Version/$asset"
$expectedHashes = @{
  '1.1.10' = 'f0154f47185b4231578fa9e9fa0e53d6ce939dc945c5a2a8ec494aea654f9573'
}
if (-not $expectedHashes.ContainsKey($Version)) {
  throw "No trusted SHA-256 is registered for Garnet $Version. Review the official release and update this script first."
}

$temporary = Join-Path ([IO.Path]::GetTempPath()) ("allshops-garnet-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $temporary | Out-Null
try {
  $archive = Join-Path $temporary $asset
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

  $dotnet = 'C:\Program Files\dotnet\dotnet.exe'
  $runtimeInstalled = $false
  if (Test-Path -LiteralPath $dotnet) {
    $runtimeInstalled = @(& $dotnet --list-runtimes) -match '^Microsoft\.NETCore\.App 10\.'
  }
  if (-not $runtimeInstalled) {
    Write-Host 'Installing the Microsoft .NET 10 runtime required by Garnet.'
    $dotnetInstaller = Join-Path $temporary 'dotnet-install.ps1'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://dot.net/v1/dotnet-install.ps1' -OutFile $dotnetInstaller
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dotnetInstaller `
      -Runtime dotnet `
      -Channel 10.0 `
      -Architecture x64 `
      -InstallDir 'C:\Program Files\dotnet' `
      -NoPath
    if ($LASTEXITCODE -ne 0) { throw 'The Microsoft .NET 10 runtime installation failed.' }
    $runtimeInstalled = (Test-Path -LiteralPath $dotnet) -and
      (@(& $dotnet --list-runtimes) -match '^Microsoft\.NETCore\.App 10\.')
    if (-not $runtimeInstalled) { throw 'Microsoft .NET Runtime 10 was not detected after installation.' }
  }

  Invoke-WebRequest -UseBasicParsing -Uri $download -OutFile $archive
  $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
  if ($actualHash -ne $expectedHashes[$Version]) {
    throw "Garnet archive integrity check failed. Expected $($expectedHashes[$Version]); received $actualHash."
  }

  $expanded = Join-Path $temporary 'expanded'
  Expand-Archive -LiteralPath $archive -DestinationPath $expanded
  $server = Get-ChildItem -LiteralPath $expanded -Filter GarnetServer.exe -Recurse |
    Select-Object -First 1
  if (-not $server) { throw 'GarnetServer.exe was not present in the official archive.' }

  if (Get-Service -Name AllShopsGarnet -ErrorAction SilentlyContinue) {
    Stop-Service -Name AllShopsGarnet -Force -ErrorAction SilentlyContinue
    & $nssm remove AllShopsGarnet confirm | Out-Null
  }

  $listenerProcessIds = @(Get-NetTCPConnection -LocalPort $redisUri.Port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique)
  foreach ($listenerProcessId in $listenerProcessIds) {
    $process = Get-Process -Id $listenerProcessId -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -eq 'redis-server') {
      Write-Host "Stopping legacy Redis process $($process.Id)."
      Stop-Process -Id $process.Id -Force
    } elseif ($process) {
      throw "Port $($redisUri.Port) is owned by unexpected process $($process.ProcessName) ($($process.Id))."
    }
  }

  New-Item -ItemType Directory -Force -Path $InstallDirectory,$DataDirectory,'C:\AllShops\logs' | Out-Null
  Get-ChildItem -LiteralPath $InstallDirectory -Force -ErrorAction SilentlyContinue |
    Remove-Item -Recurse -Force
  Copy-Item -Path (Join-Path $server.Directory.FullName '*') -Destination $InstallDirectory -Recurse -Force

  $configPath = Join-Path $DataDirectory 'garnet.conf'
  $config = [ordered]@{
    Port = $redisUri.Port
    Address = '127.0.0.1'
    ProtectedMode = 'yes'
    AuthenticationMode = 'Password'
    Password = $password
    EnableAOF = $true
    CommitFrequencyMs = 1000
    WaitForCommit = $false
    Recover = $true
    CheckpointDir = (Join-Path $DataDirectory 'checkpoints')
    LogDir = (Join-Path $DataDirectory 'logs')
    EnableLua = $true
    FileLogger = 'C:\AllShops\logs\AllShopsGarnet.log'
    LogLevel = 'Information'
  }
  New-Item -ItemType Directory -Force -Path $config.CheckpointDir,$config.LogDir | Out-Null
  $config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
  & icacls.exe $DataDirectory /inheritance:r /grant:r 'Administrators:(OI)(CI)F' 'SYSTEM:(OI)(CI)F' | Out-Null

  $garnetExe = Join-Path $InstallDirectory 'GarnetServer.exe'
  if (-not (Test-Path -LiteralPath $garnetExe)) {
    $garnetExe = (Get-ChildItem -LiteralPath $InstallDirectory -Filter GarnetServer.exe -Recurse | Select-Object -First 1).FullName
  }
  & $nssm install AllShopsGarnet $garnetExe | Out-Null
  & $nssm set AllShopsGarnet AppParameters "--config-import-path `"$configPath`"" | Out-Null
  & $nssm set AllShopsGarnet AppDirectory (Split-Path $garnetExe) | Out-Null
  & $nssm set AllShopsGarnet AppStdout 'C:\AllShops\logs\AllShopsGarnet-stdout.log' | Out-Null
  & $nssm set AllShopsGarnet AppStderr 'C:\AllShops\logs\AllShopsGarnet-error.log' | Out-Null
  & $nssm set AllShopsGarnet AppExit Default Restart | Out-Null
  & $nssm set AllShopsGarnet Start SERVICE_AUTO_START | Out-Null
  Start-Service AllShopsGarnet
  Start-Sleep -Seconds 3

  Set-Location $repo
  node ops/windows/Test-Redis.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Garnet protocol preflight failed.' }
  Write-Host "Garnet $Version is installed, authenticated, loopback-only, persistent, and healthy."
} finally {
  Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue
}
