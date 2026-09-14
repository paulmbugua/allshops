# AllShops Mobile

Native Flutter companion for the AllShops web application. It uses the same NestJS API, organization and branch boundaries, permissions, pricing, stock, sales, appointments, subscriptions, pilot controls, and reporting data as the web client.

For a signed Google Play release targeting Android API 36, follow [the mobile Play release guide](../../docs/operations/mobile-play-release.md). Google Play receives the generated `.aab`; APKs are retained for direct QA installation.

## What is operational

- Authentication and organization/branch context
- Product browsing, barcode scanning, cart totals, cash checkout, and local-card checkout
- Durable paid checkout outbox with idempotent retry after a timeout, process exit, or device restart
- Offline sale queue and manual/automatic synchronization
- Searchable mobile workspaces for sales, held sales, catalogue, customers, suppliers, purchases, expenses, appointments, staff, commissions, inventory, transfers, devices, users, subscription, billing, reports, and support
- Status-aware actions for appointments, transfers, devices, and cancellable draft transactions
- Create forms for the simpler master-data resources

Paystack is intentionally reserved for the AllShops subscription flow. Merchant POS payments expose only cash and the merchant's local card terminal.

## Prerequisites

Start the API, PostgreSQL, and Redis from the repository root before running the app:

```powershell
Set-Location E:\projects\qatarpos
docker compose up -d
pnpm dev
```

Keep that terminal running. In a second terminal, confirm Flutter and Android tooling:

```powershell
C:\dev\flutter\bin\flutter.bat doctor
```

## Run on an Android emulator

The Android emulator reaches the API on the Windows host through `10.0.2.2`:

```powershell
Set-Location E:\projects\qatarpos\apps\mobile
C:\dev\flutter\bin\flutter.bat pub get
C:\dev\flutter\bin\flutter.bat run --dart-define=ALLSHOPS_API_URL=http://10.0.2.2:4000/api/v1
```

## Run on a physical Android device

For USB development on Windows, keep `pnpm dev` running and use the repository
helper. It selects the connected device, forwards the API port over ADB, repairs
the child-process PowerShell PATH, and launches the side-by-side debug app:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-mobile-dev.ps1
```

Pass `-DeviceId <adb-id>` when more than one physical Android device is attached.
If Xiaomi/HyperOS blocks ADB installation, install the generated debug APK from
the phone's Downloads folder, then connect hot reload without reinstalling it:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-mobile-dev.ps1 -AttachInstalled
```

## Development logs

Debug builds emit structured `ALLSHOPS` JSON logs for lifecycle, navigation,
session restoration, sanitized API timing/status, token refresh, POS checkout,
and offline synchronization. Credentials, cookies, request bodies, card
references and tokens are not logged. Logs are disabled in release builds.

They appear directly in the `flutter run`/attach terminal. To watch only app
logs from a separate PowerShell window:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\watch-mobile-logs.ps1 -DeviceId zd8hgi6h956h99ov -Clear
```

Use `Ctrl+C` to stop watching. Set `--dart-define=ALLSHOPS_DEV_LOGS=false` when
you intentionally need a quiet debug build.

Replace `192.168.1.20` with the Windows computer's LAN address. The device and computer must be on the same network, Windows Firewall must allow the API port, and the API must listen on an address reachable from the LAN.

```powershell
Set-Location E:\projects\qatarpos\apps\mobile
C:\dev\flutter\bin\flutter.bat run --dart-define=ALLSHOPS_API_URL=http://192.168.1.20:4000/api/v1
```

## Validate

```powershell
Set-Location E:\projects\qatarpos\apps\mobile
C:\dev\flutter\bin\flutter.bat analyze
C:\dev\flutter\bin\flutter.bat test
```

## Build

The current verified development artifact is arm64-only and is intended for modern Android phones and tablets:

```powershell
Set-Location E:\projects\qatarpos\apps\mobile
C:\dev\flutter\bin\flutter.bat build apk --debug --target-platform android-arm64 --dart-define=ALLSHOPS_API_URL=https://your-api.example.com/api/v1
```

The verified APK is written to:

`build/app/outputs/flutter-apk/allshops-mobile-debug.apk`

Do not distribute the debug APK as a production release. Before store or customer distribution, configure a private Android release signing key, build against an HTTPS API, remove debug-only clear-text networking, and produce a signed release APK or Android App Bundle.

## Transaction safety

Paid checkout is written to SQLite before the first network request. Retries reuse the same transaction UUID/idempotency key, and records remain queued until the API returns a terminal result. A browser/app reload or a lost HTTP response therefore cannot silently discard a locally acknowledged paid transaction.
