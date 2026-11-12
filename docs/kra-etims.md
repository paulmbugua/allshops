# KRA eTIMS integration runbook

AllShops is the Trader Invoicing System (TIS). KRA eTIMS is the fiscal authority. A locally completed sale and a KRA-accepted fiscal invoice are deliberately tracked as separate states.

## Safety and compliance model

- `DISABLED` and `DRAFT` do not transmit fiscal documents.
- `SANDBOX` transmits only to KRA's test endpoint and prints a visible test label.
- `CERTIFIED` is the only status that transmits to production. The API rejects `CERTIFIED` with a sandbox environment.
- Checkout requires an initialized KRA branch, an encrypted communication key and complete mappings for every cart item once submission is enabled.
- Checkout commits inventory, payment, audit history and a durable fiscal outbox entry in one database transaction.
- The worker submits the immutable snapshot to `/saveTrnsSalesOsdc`. Network and HTTP failures use bounded exponential retry. KRA business rejections enter the dead-letter state for administrator review.
- A receipt displays KRA receipt data only after result code `000`. Pending receipts explicitly say they are not yet KRA-accepted tax invoices.
- Refunds and returns create credit-note documents referencing the original accepted KRA receipt. Stock reversal remains transactional and idempotent.
- Communication keys are encrypted with AES-256-GCM. They are never returned by the API or included in fiscal request snapshots.

## Required environment

Generate an independent encryption key and add it to the API and worker environment:

```sh
openssl rand -hex 32
```

Set `ETIMS_ENCRYPTION_KEY` to the result. Keep the sandbox and production base URLs at their documented defaults unless KRA provides replacements. Restart both API and worker after configuration changes.

## Onboarding sequence

1. Apply through the KRA eTIMS portal as a self-integrator or certified third-party vendor.
2. Keep the AllShops integration in `DRAFT`.
3. Enter the organization KRA PIN and encrypted communication key.
4. Configure each AllShops branch with its two-digit KRA branch ID and approved device serial.
5. Confirm initialization only after KRA has initialized that device.
6. Map every active product to its KRA item code, 10-digit classification, tax type, package unit and quantity unit.
7. Change status to `SANDBOX` and complete the KRA certification test scripts.
8. Pilot with a controlled merchant and reconcile AllShops totals against the KRA sandbox.
9. After written KRA production approval, change environment to `PRODUCTION` and status to `CERTIFIED`.

Never copy sandbox communication keys into production. Never mark a device initialized merely to bypass checkout validation.

## Operations

The web workspace exposes **Settings → KRA eTIMS** with readiness counts, branch/device mapping, product classification, fiscal delivery status and controlled retries.

Investigate rejected documents before retrying. Correct the underlying branch, product or taxpayer data first. Accepted documents cannot be resubmitted. Credit notes wait until their original sale has a KRA receipt number.

Back up the database and `ETIMS_ENCRYPTION_KEY` through separate protected channels. Losing the encryption key makes existing KRA communication credentials unrecoverable and requires credential rotation.

## Certification boundary

This implementation provides the OSCU integration foundation and official sales endpoint contract. Production use still requires KRA sandbox testing, vendor vetting and certification. Do not market AllShops as KRA-certified until KRA has formally approved the exact release being deployed.
