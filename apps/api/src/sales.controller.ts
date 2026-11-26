import {
  Body,
  Controller,
  Get,
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
  completeHeldSaleSchema,
  holdSaleSchema,
  idempotencyKeySchema,
  initializeCardPaymentSchema,
  posBarcodeLookupSchema,
  posProductListSchema,
  refundSchema,
  salesListSchema,
} from "@allshops/contracts";
import { RequirePermission } from "./permissions.decorator.js";
import { Public } from "./public.decorator.js";
import { darajaConfig } from "./daraja.js";
import { SalesService } from "./sales.service.js";
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
