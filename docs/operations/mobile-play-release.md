# Flutter Android production and Google Play release

## Release format

Google Play should receive an Android App Bundle (`.aab`), not a universal APK. Play App Signing turns the uploaded bundle into an optimized APK for each compatible device. This POS release targets modern `arm64-v8a` Android phones and tablets; legacy 32-bit and x86 Android devices are intentionally excluded. A signed APK remains useful for direct QA installation, so the production script can build one with `-AlsoBuildApk`.

The project explicitly compiles against and targets Android API 36. Its permanent application ID is `com.allshops.pos`; do not change it after the first Play Console upload.

## 1. Create the private upload key once

Use the JDK bundled with Android Studio or another supported JDK 17+:

```powershell
New-Item -ItemType Directory -Force C:\secure
keytool -genkeypair -v -keystore C:\secure\allshops-upload.jks -storetype JKS -keyalg RSA -keysize 2048 -validity 10000 -alias upload
Copy-Item apps\mobile\android\key.properties.example apps\mobile\android\key.properties
```

Edit `key.properties` with the real passwords and keystore path. Back up the `.jks`, passwords, and alias in an encrypted password manager/offline vault. Neither signing file is accepted by Git.

## 2. Install Android API 36

In Android Studio, open **SDK Manager → SDK Platforms**, install **Android 16 / API 36**, then install the current API 36 Build Tools and Command-line Tools under **SDK Tools**. Verify:

```powershell
C:\dev\flutter\bin\flutter.bat doctor -v
Test-Path "$env:LOCALAPPDATA\Android\Sdk\platforms\android-36\android.jar"
```

## 3. Build the Play bundle

From the repository root:

```powershell
C:\dev\flutter\bin\flutter.bat pub run flutter_launcher_icons -f apps\mobile\pubspec.yaml
powershell -ExecutionPolicy Bypass -File scripts\build-mobile-production.ps1
```

Or build both the Play bundle and an arm64 QA APK:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-mobile-production.ps1 -AlsoBuildApk
```

The optional `-SkipChecks` switch exists only to resume packaging after analysis and tests have already passed for the exact source revision and a Windows Flutter subprocess has subsequently crashed. Never use it to bypass a real diagnostic or failing test.

The script runs dependency resolution, static analysis, tests, release signing, R8 shrinking, Dart obfuscation, and injects only this public URL:

```text
https://api.ekazi.co.ke/api/v1
```

Artifacts:

- Play upload: `apps/mobile/build/app/outputs/bundle/release/app-release.aab`
- Direct QA: `apps/mobile/build/app/outputs/flutter-apk/app-release.apk`
- Private crash symbols: `apps/mobile/build/symbols/1.0.0+1`

Never delete the symbol directory for a released version. It is required to decode obfuscated crash traces.

## 4. Play Console rollout

1. Create the app as **AllShops POS**, choose the default language and app category, and enroll in Play App Signing.
2. Complete Data safety, privacy policy, content rating, target audience, ads declaration, app access instructions, and account-deletion disclosures.
3. Upload the `.aab` to **Internal testing** first.
4. Install through the Play testing link and verify login, barcode permission, cash/local-card sales, offline/reconnect behavior, subscription Paystack return/verification, branch permissions, and background/resume behavior against the production API.
5. Promote the same tested artifact to closed testing, staged production (for example 10%, 25%, 50%), and then 100% after monitoring API errors and support reports.
6. Increment the `+buildNumber` in `pubspec.yaml` for every upload; Google Play rejects reused version codes.

The app contains no API or Paystack secret. Authentication tokens use platform secure storage, and production Android rejects clear-text HTTP traffic.
