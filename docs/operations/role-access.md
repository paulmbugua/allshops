# Staff access and role allocation

AllShops authorizes every API request with permissions from the signed-in user's
active organization membership. Web and mobile use the same permission list to
hide unavailable navigation and actions; the API remains the authoritative
enforcement boundary.

## Recommended built-in roles

| Role              | Scope                           | Intended access                                                                                                                                         |
| ----------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner             | Entire organization             | Every business and billing action. The last owner cannot be removed or suspended.                                                                       |
| Administrator     | Entire organization             | All operational and configuration actions except subscription billing management. Cannot assign or manage owners.                                       |
| Business Manager  | Entire organization             | Users, branches, catalogue, stock, purchasing, POS, services, reports, devices, and audited sync recovery. No subscription billing.                     |
| Branch Manager    | One required branch             | Business-manager operations constrained to the assigned branch. Can update that branch, but cannot create branches or alter organization-wide settings. |
| POS Supervisor    | One required branch             | Cashier work plus discounts, credit sales, customer payments, dashboards, and audited offline-conflict recovery.                                        |
| Cashier           | One required branch             | Sell, hold or cancel an unpaid sale, record cash/local-card payment, print receipts, create customers, and synchronize that POS device.                 |
| Inventory Manager | Organization or assigned branch | Products, stock, suppliers, purchase receiving, inventory reports, and exports.                                                                         |
| Accountant        | Organization or assigned branch | Financial records, expenses, customer/supplier balances, commissions, financial reports, and exports.                                                   |
| Service Staff     | One required branch             | Assigned service work, availability, appointments, own commissions, and related dashboards.                                                             |
| Auditor           | Organization or assigned branch | Read-only operational, cost, audit, and reporting access.                                                                                               |

## Safety rules

- Cashiers cannot change product prices or costs, post stock adjustments, manage
  staff, view roles, access reports, or resolve failed offline transactions.
- POS supervisors can resolve an offline conflict. Stock override is shown only
  for an `INSUFFICIENT_STOCK` conflict; rejection remains available for other
  conflicts. Each resolution is recorded in the audit log.
- Branch Manager, POS Supervisor, Cashier, and Service Staff memberships require
  a branch. API queries also enforce this branch scope.
- A user can assign only roles whose complete permission set they already hold.
  Only an Owner can assign or manage another Owner.
- Users cannot suspend themselves, and the final active Owner is protected.
- Hiding a button is a usability aid, not the security boundary. Direct API calls
  are independently rejected by the permission and tenant guards.

## Deployment

Apply the migration and synchronize built-in permission matrices before inviting
staff:

```powershell
Set-Location E:\projects\qatarpos
docker compose up -d
pnpm db:migrate
pnpm db:seed
```

After deployment, open **Settings → Users**, choose the lowest-privilege role
that fits the job, and assign a branch whenever the interface marks it required.
Existing sessions receive the current database permissions whenever `/auth/me`
is refreshed; sign out and back in after changing a user's role for an immediate
clean session refresh on every device.
