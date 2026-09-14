# Pilot UAT checklist

For every scenario record Expected Result, Actual Result, PASS/FAIL and Notes. Automated tests are evidence, not a replacement for merchant acceptance.

## Core scenarios

Login/RBAC; branch visibility; product/service creation; barcode entry; opening stock; cash sale; local card-recorded sale; receipt; discount; inventory deduction; customer and credit (if enabled); purchase receiving; expense; reports; subscription state; and offline sync (if enabled).

## Profiles

- Retail: catalogue, stock, barcode, POS, receipts, purchases and reports.
- Auto spare parts: SKU/barcode, brands, suppliers, stock and customer credit.
- Salon/service: services, staff, appointments, commissions and service receipts.

Automated pilot suites must be labelled `AUTOMATED PASS`. Physical printer/scanner, real tablet/PWA offline behavior, internet reconnection and merchant comprehension are `MANUAL PILOT VERIFICATION REQUIRED`.
