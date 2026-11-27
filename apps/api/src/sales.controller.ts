import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  checkoutSchema,
  advancePosOrderSchema,
  completeHeldSaleSchema,
  holdSaleSchema,
  idempotencyKeySchema,
  initializeCardPaymentSchema,
  posBarcodeLookupSchema,
  posProductListSchema,
  placePosOrderSchema,
  refundSchema,
  salesListSchema,
} from "@allshops/contracts";
import { RequirePermission } from "./permissions.decorator.js";
import { Public } from "./public.decorator.js";
import { darajaConfig } from "./daraja.js";
import { SalesService } from "./sales.service.js";
import { printDate, printMoney, printPdfFile, type PrintTable } from "./print-pdf.js";
import type { RequestContext } from "./security.types.js";
import { assertUuid, parseInput } from "./validation.js";

const requiredIdempotencyKey = (value?: string) =>
  parseInput(idempotencyKeySchema, value);
const kenyaMobile = z
  .string()
  .trim()
  .max(24)
  .transform((value) => value.replace(/[\s()-]/g, "").replace(/^\+?254/, "0"))
  .pipe(
    z.string().regex(/^0[17]\d{8}$/, "Enter a valid Kenyan mobile number."),
  );

@ApiTags("Sales")
@ApiBearerAuth()
@Controller("organizations/:organizationId")
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @RequirePermission("sale.create", "payment.record")
  @Get("pos/mpesa")
  async mpesaStatus(@Req() request: RequestContext) {
    return {
      enabled: Boolean(darajaConfig(request.tenant!.organizationId)),
      active: await this.sales.activeMpesa(request.tenant!, request.user!.id),
    };
  }

  @RequirePermission("sale.create", "payment.record")
  @Post("pos/mpesa")
  startMpesa(@Body() body: unknown, @Req() request: RequestContext) {
    const { phone, checkout, expectedMinor } = parseInput(
      z.object({
        phone: kenyaMobile,
        checkout: initializeCardPaymentSchema,
        expectedMinor: z.number().int().positive(),
      }),
      body,
    );
    return this.sales.startMpesa(
      request.tenant!,
      request.user!.id,
      phone,
      checkout,
      expectedMinor,
    );
  }

  @RequirePermission("sale.create", "payment.record")
  @Post("pos/mpesa/:intentId/check")
  checkMpesa(
    @Param("intentId") intentId: string,
    @Req() request: RequestContext,
  ) {
    return this.sales.checkMpesa(
      request.tenant!,
      request.user!.id,
      assertUuid(intentId, "intentId"),
    );
  }

  @Public()
  @HttpCode(200)
  @Post("pos/mpesa/callback")
  mpesaCallback() {
    // Only the authenticated Daraja status query can confirm payment.
    return { ResultCode: 0, ResultDesc: "Accepted" };
  }

  @RequirePermission("catalogue.read")
  @Get("pos/branches")
  branches(@Req() request: RequestContext) {
    return this.sales.posBranches(request.tenant!);
  }

  @RequirePermission("organization.read")
  @Get("pos/configuration")
  @Header("Cache-Control", "private, no-store")
  posConfiguration(@Req() request: RequestContext) {
    return this.sales.posConfiguration(request.tenant!);
  }

  @RequirePermission("catalogue.read")
  @Get("pos/products")
  products(@Query() query: unknown, @Req() request: RequestContext) {
    return this.sales.posProducts(
      request.tenant!,
      parseInput(posProductListSchema, query),
    );
  }

  @RequirePermission("catalogue.read")
  @Get("pos/products/barcode")
  productByBarcode(@Query() query: unknown, @Req() request: RequestContext) {
    return this.sales.posProductByBarcode(
      request.tenant!,
      parseInput(posBarcodeLookupSchema, query),
    );
  }

  @ApiHeader({
    name: "Idempotency-Key",
    required: true,
    description: "UUID used to safely retry checkout",
  })
  @RequirePermission("sale.create", "payment.record")
  @Post("sales/checkout")
  checkout(
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: RequestContext,
  ) {
    return this.sales.checkout(
      request.tenant!,
      request.user!.id,
      parseInput(checkoutSchema, body),
      requiredIdempotencyKey(key),
    );
  }

  @RequirePermission("sale.hold")
  @Post("sales/held")
  hold(@Body() body: unknown, @Req() request: RequestContext) {
    return this.sales.createHeld(
      request.tenant!,
      request.user!.id,
      parseInput(holdSaleSchema, body),
    );
  }

  @RequirePermission("sale.hold", "sale.create")
  @Post("pos/orders")
  placeOrder(@Body() body: unknown, @Headers("idempotency-key") key: string | undefined, @Req() request: RequestContext) {
    return this.sales.placeOrder(request.tenant!, request.user!.id, parseInput(placePosOrderSchema, body), requiredIdempotencyKey(key));
  }

  @RequirePermission("sale.read")
  @Get("pos/orders")
  orders(@Query() query: unknown, @Req() request: RequestContext) {
    const filter = parseInput(salesListSchema.pick({ branchId: true, page: true, pageSize: true }), query);
    return this.sales.list(request.tenant!, { ...filter, status: "HELD" }, true);
  }

  @RequirePermission("sale.hold")
  @Post("pos/orders/:saleId/advance")
  advanceOrder(@Param("saleId") id: string, @Body() body: unknown, @Req() request: RequestContext) {
    const { from } = parseInput(advancePosOrderSchema, body);
    return this.sales.advanceOrder(request.tenant!, request.user!.id, assertUuid(id, "saleId"), from);
  }

  @RequirePermission("sale.read")
  @Get("sales/held")
  held(@Query() query: unknown, @Req() request: RequestContext) {
    return this.sales.held(request.tenant!, parseInput(salesListSchema, query));
  }

  @RequirePermission("sale.read")
  @Get("sales")
  list(@Query() query: unknown, @Req() request: RequestContext) {
    return this.sales.list(request.tenant!, parseInput(salesListSchema, query));
  }

  @RequirePermission("receipt.print")
  @Get("sales/:saleId/receipt")
  receipt(
    @Param("saleId") saleId: string,
    @Query("mode") mode: string | undefined,
    @Req() request: RequestContext,
  ) {
    return this.sales.receipt(
      request.tenant!,
      request.user!.id,
      assertUuid(saleId, "saleId"),
      mode === "initial",
    );
  }

  @RequirePermission("receipt.print")
  @Get("sales/:saleId/receipt/pdf")
  @Header("Cache-Control", "private, no-store")
  async receiptPdf(@Param("saleId") id: string, @Req() request: RequestContext) {
    const tenant = request.tenant!;
    const saleId = assertUuid(id, "saleId");
    const userId = request.user!.id;
    if (tenant.roleCode === "CASHIER" && (await this.sales.detail(tenant, saleId)).createdBy !== userId) {
      throw new ForbiddenException("You can only download receipts for your own sales.");
    }
    const sale = await this.sales.receipt(tenant, userId, saleId);
    const money = (minor: number) => printMoney(minor, sale.currency);
    const summary: NonNullable<PrintTable["summary"]> = [
      ["Branch address", sale.branch.address], ["KRA PIN", sale.kraPin], ["Cashier", sale.creator.name],
      ["Subtotal", money(sale.subtotalMinor)], ["Discount", money(sale.discountMinor)], ["Tax", money(sale.taxMinor)],
      ["Sale total", money(sale.totalMinor)], ["Paid", money(sale.paidMinor)], ["Balance due", money(sale.balanceMinor)],
    ];
    for (const payment of sale.payments) {
      const method = payment.method === "OTHER" && payment.reference?.startsWith("M-PESA") ? payment.reference.split(":", 1)[0]! : payment.method.replaceAll("_", " ");
      summary.push([method, money(payment.amountMinor)]);
    }
    if (summary.length > 15) summary.splice(15, summary.length - 15, ["Additional payments", "See the sale detail for the full breakdown"]);
    if (sale.changeMinor) summary.push(["Change", money(sale.changeMinor)]);
    if (sale.fiscalDocument?.status === "ACCEPTED") {
      if (sale.fiscalDocument.environment === "SANDBOX") summary.push(["eTIMS", "SANDBOX - NOT A PRODUCTION TAX INVOICE"]);
      summary.push(["KRA receipt", sale.fiscalDocument.currentReceiptNumber], ["Internal data", sale.fiscalDocument.internalData], ["Signature", sale.fiscalDocument.receiptSignature]);
    } else if (sale.fiscalStatus !== "NOT_REQUIRED") {
      summary.push(["eTIMS", sale.fiscalStatus.replaceAll("_", " ")]);
    }
    return printPdfFile(sale.invoiceNumber ?? "receipt", {
      organization: sale.organization.name,
      title: `Sales receipt ${sale.invoiceNumber ?? ""}`.trim(),
      context: `${sale.branch.name} | ${printDate(sale.completedAt ?? sale.createdAt)}`,
      closingNote: sale.loyaltyAward ? `Loyalty member: ${sale.loyaltyAward.memberName} | Points earned: ${sale.loyaltyAward.points}` : undefined,
      summary, headers: ["Item", "Quantity", "Unit price", "Line total"],
      rows: sale.items.map((item) => [item.variantNameSnapshot ? `${item.productNameSnapshot} / ${item.variantNameSnapshot}` : item.productNameSnapshot, item.quantity.toString(), money(item.unitPriceMinor), money(item.totalMinor)]),
    });
  }

  @RequirePermission("sale.read")
  @Get("sales/:saleId")
  detail(@Param("saleId") saleId: string, @Req() request: RequestContext) {
    return this.sales.detail(request.tenant!, assertUuid(saleId, "saleId"));
  }

  @RequirePermission("sale.create", "payment.record")
  @Post("sales/:saleId/loyalty-award")
  awardLoyalty(
    @Param("saleId") saleId: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    const member = parseInput(z.object({ phone: kenyaMobile }), body);
    return this.sales.awardLoyalty(
      request.tenant!,
      request.user!.id,
      assertUuid(saleId, "saleId"),
      member.phone,
    );
  }

  @ApiHeader({
    name: "Idempotency-Key",
    required: true,
    description: "UUID used to safely retry sale completion",
  })
  @RequirePermission("sale.create", "payment.record")
  @Post("sales/:saleId/complete")
  complete(
    @Param("saleId") saleId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: RequestContext,
  ) {
    return this.sales.completeHeld(
      request.tenant!,
      request.user!.id,
      assertUuid(saleId, "saleId"),
      parseInput(completeHeldSaleSchema, body),
      requiredIdempotencyKey(key),
    );
  }

  @RequirePermission("sale.cancel_draft")
  @Post("sales/:saleId/cancel")
  cancel(@Param("saleId") saleId: string, @Req() request: RequestContext) {
    return this.sales.cancel(
      request.tenant!,
      request.user!.id,
      assertUuid(saleId, "saleId"),
    );
  }

  @ApiHeader({ name: "Idempotency-Key", required: true })
  @RequirePermission("sale.refund")
  @Post("sales/:saleId/refund")
  refund(
    @Param("saleId") saleId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: RequestContext,
  ) {
    return this.sales.refund(
      request.tenant!,
      request.user!.id,
      assertUuid(saleId, "saleId"),
      parseInput(refundSchema, body),
      requiredIdempotencyKey(key),
    );
  }
}
