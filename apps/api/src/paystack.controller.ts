import { Controller, Headers, Param, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import {
  idempotencyKeySchema,
  identifier,
  paystackReferenceSchema,
} from "@allshops/contracts";
import { PaystackService } from "./paystack.service.js";
import { RequirePermission } from "./permissions.decorator.js";
import type { RequestContext } from "./security.types.js";
import { parseInput } from "./validation.js";

@ApiTags("Paystack card payments")
@ApiBearerAuth()
@Controller("organizations/:organizationId/payments/paystack")
export class PaystackController {
  constructor(private readonly paystack: PaystackService) {}

  @ApiHeader({ name: "Idempotency-Key", required: true })
  @RequirePermission("billing.manage")
  @Post("subscriptions/:billingRecordId/initialize")
  initializeSubscription(
    @Param("billingRecordId") billingRecordId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: RequestContext,
  ) {
    return this.paystack.initializeSubscription(
      request.tenant!,
      request.user!.id,
      parseInput(identifier, billingRecordId),
      parseInput(idempotencyKeySchema, key),
    );
  }

  @RequirePermission("billing.manage")
  @Post("subscriptions/:reference/verify")
  verifySubscription(
    @Param("reference") reference: string,
    @Req() request: RequestContext,
  ) {
    return this.paystack.verifySubscription(
      request.tenant!,
      parseInput(paystackReferenceSchema, reference),
    );
  }
}
