# Historical ADR 0009: Paystack subscription card payments

## Decision

The final product decision supersedes the merchant-POS portion of this ADR: customer-sale payment surfaces allow cash or a card approved on the merchant's own local terminal. Paystack is exposed only for AllShops subscription billing. Local terminal choices include Qatar providers such as QNB, Doha Bank, Commercial Bank, QIB, Dukhan Bank, and Ahlibank, plus a neutral fallback. The optional terminal reference is retained for reconciliation; AllShops never receives card credentials.

The API owns Paystack initialization and verification for AllShops subscription invoices. It stores an immutable purpose and amount snapshot, creates a unique Paystack reference, and requests only the `card` Paystack channel. Browser code receives an authorization URL but never receives the Paystack secret or handles card data.

The subscription return route asks the API to retrieve the transaction directly from Paystack. Verification succeeds only when reference, successful status, exact minor-unit amount, configured currency, and card channel match the stored subscription intent. Failed or abandoned attempts never activate a subscription.

## Reliability and accounting

Initialization uses an organization-scoped UUID idempotency key and a request hash. Concurrent reuse can create only one intent; reuse for different content is rejected. Repeated redirects or retries can verify only the same subscription billing record.

Provider capture and subscription activation cannot be one database transaction. The verified intent is therefore bound to the billing record and activation is retry-safe.

A verified subscription Paystack payment marks only its SaaS billing record paid and activates the subscription. Tests assert that it creates no merchant sale, POS payment, invoice, stock movement, or appointment settlement.

## Operational constraints

- `PAYSTACK_SECRET_KEY` is required only in the API environment and must be rotated if exposed. `PAYSTACK_SUBSCRIPTION_CALLBACK_URL` is the only Paystack callback.
- `PAYSTACK_CURRENCY` defaults to `KES`, a Paystack-supported currency. QAR is not currently listed by Paystack. Because the application ledger is QAR, an explicit rate such as `PAYSTACK_QAR_TO_KES_RATE` is required. The intent stores both invoice and gateway amounts.
- Paystack checkout requires an internet connection. Cash and local terminal choices remain available to the merchant without routing their funds through Paystack.
- Return-page verification is implemented. Signed webhook reconciliation and automatic recurring collection remain deferred.
