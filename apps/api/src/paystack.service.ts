import { createHash, randomUUID } from "node:crypto";
import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma, prisma } from "@allshops/database";
import type {
  AppointmentCheckoutInput,
  CheckoutInput,
  CompleteHeldSaleInput,
  InitializeAppointmentCardPaymentInput,
  InitializeCardPaymentInput,
  InitializeHeldCardPaymentInput,
} from "@allshops/contracts";
import { SalesService } from "./sales.service.js";
import type { TenantContext } from "./security.types.js";
import { SubscriptionsService } from "./subscriptions.service.js";

type PaystackEnvelope<T> = { status: boolean; message: string; data?: T };
type PaystackInitialize = {
  authorization_url: string;
  access_code: string;
  reference: string;
};
type PaystackVerification = {
  id: number;
  status: string;
  reference: string;
  amount: number;
  currency: string;
  channel: string;
  gateway_response?: string;
  paid_at?: string;
};
type StoredCheckout =
  | { kind: "STANDARD"; input: InitializeCardPaymentInput }
  | {
      kind: "APPOINTMENT";
      appointmentId: string;
      input: InitializeAppointmentCardPaymentInput;
    }
  | {
      kind: "HELD";
      saleId: string;
      input: InitializeHeldCardPaymentInput;
    }
  | { kind: "SUBSCRIPTION"; billingRecordId: string };

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

@Injectable()
export class PaystackService {
  constructor(
    private readonly sales: SalesService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async initialize(
    tenant: TenantContext,
    userId: string,
    input: InitializeCardPaymentInput,
    idempotencyKey: string,
  ) {
    const checkout: StoredCheckout = { kind: "STANDARD", input };
    const existing = await this.existingIntent(
      tenant.organizationId,
      idempotencyKey,
      checkout,
    );
    if (existing) return existing;
    const quote = await this.sales.quoteCardPayment(tenant, input);
    return this.initializeQuoted(
      tenant,
      userId,
      checkout,
      input.branchId,
      quote,
      idempotencyKey,
    );
  }

  async initializeAppointment(
    tenant: TenantContext,
    userId: string,
    appointmentId: string,
    input: InitializeAppointmentCardPaymentInput,
    idempotencyKey: string,
  ) {
    const checkout: StoredCheckout = {
      kind: "APPOINTMENT",
      appointmentId,
      input,
    };
    const existing = await this.existingIntent(
      tenant.organizationId,
      idempotencyKey,
      checkout,
    );
    if (existing) return existing;
    const quote = await this.sales.quoteAppointmentCardPayment(
      tenant,
      appointmentId,
      input,
    );
    return this.initializeQuoted(
      tenant,
      userId,
      checkout,
      quote.branchId,
      quote,
      idempotencyKey,
    );
  }

  async initializeHeld(
    tenant: TenantContext,
    userId: string,
    saleId: string,
    input: InitializeHeldCardPaymentInput,
    idempotencyKey: string,
  ) {
    const checkout: StoredCheckout = { kind: "HELD", saleId, input };
    const existing = await this.existingIntent(
      tenant.organizationId,
      idempotencyKey,
      checkout,
    );
    if (existing) return existing;
    const quote = await this.sales.quoteHeldCardPayment(tenant, saleId, input);
    return this.initializeQuoted(
      tenant,
      userId,
      checkout,
      quote.branchId,
      quote,
      idempotencyKey,
    );
  }

  async initializeSubscription(
    tenant: TenantContext,
    userId: string,
    billingRecordId: string,
    idempotencyKey: string,
  ) {
    const checkout: StoredCheckout = {
      kind: "SUBSCRIPTION",
      billingRecordId,
    };
    const existing = await this.existingIntent(
      tenant.organizationId,
      idempotencyKey,
      checkout,
    );
    if (existing) return existing;
    const bill = await prisma.billingRecord.findFirst({
      where: {
        id: billingRecordId,
        organizationId: tenant.organizationId,
        status: "DUE",
      },
    });
    if (!bill)
      throw new NotFoundException({
        code: "BILLING_RECORD_NOT_DUE",
        message: "A payable subscription billing record was not found.",
      });
    return this.initializeQuoted(
      tenant,
      userId,
      checkout,
      null,
      { totals: { totalMinor: bill.amountMinor }, priceSnapshots: [] },
      idempotencyKey,
      {
        sourceCurrency: bill.currency,
        callbackUrl:
          process.env.PAYSTACK_SUBSCRIPTION_CALLBACK_URL ??
          `${process.env.APP_URL}/settings/subscription/payment-return`,
        billingRecordId: bill.id,
      },
    );
  }

  private async existingIntent(
    organizationId: string,
    idempotencyKey: string,
    checkout: StoredCheckout,
  ) {
    const existing = await prisma.paystackPaymentIntent.findUnique({
      where: {
        organizationId_idempotencyKey: { organizationId, idempotencyKey },
      },
    });
    if (!existing) return null;
    if (existing.requestHash !== digest(checkout))
      throw new ConflictException({
        code: "IDEMPOTENCY_KEY_REUSE_MISMATCH",
        message: "This key was already used for a different card payment.",
      });
    return this.publicIntent(existing);
  }

  private async initializeQuoted(
    tenant: TenantContext,
    userId: string,
    checkout: StoredCheckout,
    branchId: string | null,
    quote: {
      totals: { totalMinor: number };
      priceSnapshots: Array<{ key: string; unitPriceMinor: number }>;
    },
    idempotencyKey: string,
    settings?: {
      sourceCurrency?: string;
      callbackUrl?: string;
      billingRecordId?: string;
    },
  ) {
    const requestHash = digest(checkout);
    const existing = await prisma.paystackPaymentIntent.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: tenant.organizationId,
          idempotencyKey,
        },
      },
    });
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new ConflictException({
          code: "IDEMPOTENCY_KEY_REUSE_MISMATCH",
          message: "This key was already used for a different card payment.",
        });
      return this.publicIntent(existing);
    }

    if (quote.totals.totalMinor <= 0)
      throw new ConflictException({
        code: "PAYSTACK_POSITIVE_AMOUNT_REQUIRED",
        message: "Card checkout requires a positive sale total.",
      });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.email)
      throw new ConflictException({
        code: "PAYSTACK_EMAIL_REQUIRED",
        message: "The cashier account needs an email address for card payment.",
      });
    const reference = `ASP-${randomUUID().replaceAll("-", "")}`;
    const sourceCurrency = settings?.sourceCurrency ?? "QAR";
    const sourceAmountMinor = quote.totals.totalMinor;
    const currency = process.env.PAYSTACK_CURRENCY ?? "KES";
    const amountMinor = this.gatewayAmount(
      sourceAmountMinor,
      sourceCurrency,
      currency,
    );
    let intent;
    try {
      intent = await prisma.paystackPaymentIntent.create({
        data: {
          organizationId: tenant.organizationId,
          branchId,
          billingRecordId: settings?.billingRecordId,
          createdBy: userId,
          reference,
          idempotencyKey,
          requestHash,
          sourceAmountMinor,
          sourceCurrency,
          amountMinor,
          currency,
          checkoutJson: json(checkout),
          priceSnapshotJson: json(quote.priceSnapshots),
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      const winner = await prisma.paystackPaymentIntent.findUniqueOrThrow({
        where: {
          organizationId_idempotencyKey: {
            organizationId: tenant.organizationId,
            idempotencyKey,
          },
        },
      });
      if (winner.requestHash !== requestHash)
        throw new ConflictException({
          code: "IDEMPOTENCY_KEY_REUSE_MISMATCH",
          message: "This key was already used for a different card payment.",
        });
      return this.publicIntent(winner);
    }

    try {
      const initialized = await this.paystack<PaystackInitialize>(
        "/transaction/initialize",
        {
          method: "POST",
          body: {
            email: user.email,
            amount: String(intent.amountMinor),
            currency,
            reference,
            callback_url:
              settings?.callbackUrl ??
              process.env.PAYSTACK_CALLBACK_URL ??
              `${process.env.APP_URL}/pos/payment-return`,
            channels: ["card"],
            metadata: JSON.stringify({
              platform: "allshops",
              organizationId: tenant.organizationId,
              paymentIntentId: intent.id,
              paymentMethod: "card",
              purpose:
                checkout.kind === "SUBSCRIPTION"
                  ? "allshops_subscription"
                  : "merchant_sale",
            }),
          },
        },
      );
      const updated = await prisma.paystackPaymentIntent.update({
        where: { id: intent.id },
        data: {
          status: "REQUIRES_ACTION",
          authorizationUrl: initialized.authorization_url,
          accessCode: initialized.access_code,
          providerPayload: { initialized: true },
        },
      });
      return this.publicIntent(updated);
    } catch (error) {
      await prisma.paystackPaymentIntent.update({
        where: { id: intent.id },
        data: {
          status: "FAILED",
          failureMessage:
            error instanceof Error
              ? error.message
              : "Paystack initialization failed.",
        },
      });
      throw error;
    }
  }

  async verify(tenant: TenantContext, reference: string) {
    const intent = await prisma.paystackPaymentIntent.findFirst({
      where: { reference, organizationId: tenant.organizationId },
    });
    if (!intent)
      throw new NotFoundException({
        code: "PAYSTACK_PAYMENT_NOT_FOUND",
        message: "Card payment was not found.",
      });
    if (intent.status === "COMPLETED") {
      if (intent.saleId)
        return {
          ...this.publicIntent(intent),
          sale: await this.sales.detail(tenant, intent.saleId),
        };
      if (intent.billingRecordId)
        return {
          ...this.publicIntent(intent),
          billingRecord: await prisma.billingRecord.findFirstOrThrow({
            where: {
              id: intent.billingRecordId,
              organizationId: tenant.organizationId,
            },
          }),
        };
    }

    const verification = await this.paystack<PaystackVerification>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
    if (verification.status !== "success") {
      if (["failed", "abandoned", "reversed"].includes(verification.status))
        await prisma.paystackPaymentIntent.update({
          where: { id: intent.id },
          data: {
            status: "FAILED",
            failureMessage:
              verification.gateway_response ??
              "Card payment was not successful.",
          },
        });
      return { ...this.publicIntent(intent), status: verification.status };
    }

    const valid =
      verification.reference === intent.reference &&
      verification.amount === intent.amountMinor &&
      verification.currency === intent.currency &&
      verification.channel === "card";
    if (!valid) {
      await prisma.paystackPaymentIntent.update({
        where: { id: intent.id },
        data: {
          status: "PAID_REQUIRES_REVIEW",
          failureMessage:
            "Paystack amount, currency, reference, or channel mismatch.",
          providerPayload: json({
            transactionId: verification.id,
            status: verification.status,
            amount: verification.amount,
            currency: verification.currency,
            channel: verification.channel,
          }),
        },
      });
      throw new ConflictException({
        code: "PAYSTACK_VERIFICATION_MISMATCH",
        message: "Paid transaction requires administrator review.",
      });
    }

    await prisma.paystackPaymentIntent.update({
      where: { id: intent.id },
      data: {
        status: "PAID",
        paidAt: verification.paid_at
          ? new Date(verification.paid_at)
          : new Date(),
        providerPayload: json({
          transactionId: verification.id,
          gatewayResponse: verification.gateway_response,
          channel: verification.channel,
        }),
      },
    });
    const checkout = intent.checkoutJson as unknown as StoredCheckout;
    const snapshots = intent.priceSnapshotJson as unknown as Array<{
      key: string;
      unitPriceMinor: number;
    }>;
    try {
      if (checkout.kind === "SUBSCRIPTION") {
        const bill = await prisma.billingRecord.findFirstOrThrow({
          where: {
            id: checkout.billingRecordId,
            organizationId: tenant.organizationId,
          },
        });
        const billingRecord = await this.subscriptions.confirmPayment(
          intent.createdBy,
          true,
          bill.subscriptionId,
          intent.id,
          {
            billingRecordId: bill.id,
            paymentMethod: "PAYSTACK",
            paymentReference: intent.reference,
          },
        );
        const completed = await prisma.paystackPaymentIntent.update({
          where: { id: intent.id },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
        return { ...this.publicIntent(completed), billingRecord };
      }
      const payment = {
        method: "CARD" as const,
        amountMinor: intent.sourceAmountMinor,
        reference: intent.reference,
      };
      const options = {
        priceOverrides: new Map(
          snapshots.map((row) => [row.key, row.unitPriceMinor]),
        ),
      };
      const sale =
        checkout.kind === "APPOINTMENT"
          ? await this.sales.checkoutAppointment(
              tenant,
              intent.createdBy,
              checkout.appointmentId,
              {
                ...(checkout.input as AppointmentCheckoutInput),
                payments: [payment],
              },
              intent.id,
              options,
            )
          : checkout.kind === "HELD"
            ? await this.sales.completeHeld(
                tenant,
                intent.createdBy,
                checkout.saleId,
                {
                  ...(checkout.input as CompleteHeldSaleInput),
                  payments: [payment],
                },
                intent.id,
                options,
              )
            : await this.sales.checkout(
                tenant,
                intent.createdBy,
                {
                  ...(checkout.input as CheckoutInput),
                  payments: [payment],
                },
                intent.id,
                options,
              );
      const completed = await prisma.paystackPaymentIntent.update({
        where: { id: intent.id },
        data: { status: "COMPLETED", saleId: sale.id, completedAt: new Date() },
      });
      return { ...this.publicIntent(completed), sale };
    } catch (error) {
      const subscriptionPayment = checkout.kind === "SUBSCRIPTION";
      await prisma.paystackPaymentIntent.update({
        where: { id: intent.id },
        data: {
          status: "PAID_REQUIRES_REVIEW",
          failureMessage:
            error instanceof Error
              ? `Payment captured but ${subscriptionPayment ? "subscription activation" : "sale completion"} failed: ${error.message}`
              : `Payment captured but ${subscriptionPayment ? "subscription activation" : "sale completion"} failed.`,
        },
      });
      throw new ConflictException({
        code: subscriptionPayment
          ? "PAID_SUBSCRIPTION_REQUIRES_REVIEW"
          : "PAID_SALE_REQUIRES_REVIEW",
        message: `Card payment succeeded, but the ${subscriptionPayment ? "subscription" : "sale"} needs administrator review. Do not charge again.`,
      });
    }
  }

  async verifySubscription(tenant: TenantContext, reference: string) {
    const intent = await prisma.paystackPaymentIntent.findFirst({
      where: { reference, organizationId: tenant.organizationId },
      select: { checkoutJson: true },
    });
    const checkout = intent?.checkoutJson as unknown as
      StoredCheckout | undefined;
    if (!intent || checkout?.kind !== "SUBSCRIPTION")
      throw new NotFoundException({
        code: "PAYSTACK_SUBSCRIPTION_PAYMENT_NOT_FOUND",
        message: "Subscription payment was not found.",
      });
    return this.verify(tenant, reference);
  }

  private async paystack<T>(
    path: string,
    options: { method?: string; body?: Record<string, unknown> } = {},
  ): Promise<T> {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret)
      throw new ServiceUnavailableException({
        code: "PAYSTACK_NOT_CONFIGURED",
        message: "Card payments are not configured.",
      });
    let response: Response;
    try {
      response = await fetch(
        `${process.env.PAYSTACK_BASE_URL ?? "https://api.paystack.co"}${path}`,
        {
          method: options.method ?? "GET",
          headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/json",
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(15_000),
        },
      );
    } catch {
      throw new BadGatewayException({
        code: "PAYSTACK_UNAVAILABLE",
        message: "Paystack could not be reached. No sale was created.",
      });
    }
    const envelope = (await response.json().catch(() => ({}))) as Partial<
      PaystackEnvelope<T>
    >;
    if (!response.ok || !envelope.status || !envelope.data)
      throw new BadGatewayException({
        code: "PAYSTACK_REQUEST_FAILED",
        message: envelope.message ?? "Paystack rejected the card transaction.",
      });
    return envelope.data;
  }

  private publicIntent(intent: {
    reference: string;
    status: string;
    amountMinor: number;
    currency: string;
    sourceAmountMinor: number;
    sourceCurrency: string;
    authorizationUrl: string | null;
    saleId: string | null;
    billingRecordId: string | null;
    failureMessage: string | null;
  }) {
    return {
      reference: intent.reference,
      status: intent.status,
      amountMinor: intent.amountMinor,
      currency: intent.currency,
      sourceAmountMinor: intent.sourceAmountMinor,
      sourceCurrency: intent.sourceCurrency,
      authorizationUrl: intent.authorizationUrl,
      saleId: intent.saleId,
      billingRecordId: intent.billingRecordId,
      failureMessage: intent.failureMessage,
    };
  }

  private gatewayAmount(
    sourceAmountMinor: number,
    sourceCurrency: string,
    gatewayCurrency: string,
  ) {
    if (sourceCurrency === gatewayCurrency) return sourceAmountMinor;
    const key = `PAYSTACK_${sourceCurrency}_TO_${gatewayCurrency}_RATE`;
    const rate = Number(process.env[key]);
    if (!Number.isFinite(rate) || rate <= 0)
      throw new ConflictException({
        code: "PAYSTACK_EXCHANGE_RATE_REQUIRED",
        message: `Set ${key} to charge ${sourceCurrency} invoices through a ${gatewayCurrency} Paystack account.`,
      });
    return Math.max(1, Math.round(sourceAmountMinor * rate));
  }
}
