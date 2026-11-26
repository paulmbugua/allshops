# AllShops platform administration

[AllShops Admin](https://admin.allshopspos.com) uses the existing production web service. The AllShops Cloudflare Tunnel publishes the hostname with origin `http://allshops-web:3000`. The API allows that exact origin for browser requests. The web router directs the admin hostname to `/platform`.

Sign in with an active, email-verified account granted `User.isPlatformAdmin`. Merchant owners and organization administrators do not inherit platform access. Provision or revoke platform access only through a trusted production operator after verifying the exact account, then record the access change in the audit log.

## Resolve a support request

1. A merchant opens **Help & diagnostics → Contact support or view your requests**. Authenticated workspace users can file requests even after a trial expires.
2. In **Support requests**, search by issue title, workspace name or request ID. Open the request and check its subscription, receipt or reference details.
3. Save a status and an update suitable for the customer to read. Customers see the latest update on their Requests page. The audit log retains prior status and response text.

## Restore or activate workspace access

- Extend an active or expired trial with a duration and a reason. If the trial already expired, the extra days start at the time of the extension.
- To activate a paid plan, use a due invoice under **Billing and plan activation** and confirm only a payment whose amount and reference have been independently verified. Confirmation activates the invoiced plan and adds a subscription history entry.
- Restore a suspended subscription when its paid period is still current. For an expired paid plan, confirm a new payment.
- Use **Change plan** to update the plan assignment. This action alone does not record payment or start a new billing period.
