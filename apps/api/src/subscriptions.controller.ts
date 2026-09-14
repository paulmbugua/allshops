import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  confirmSubscriptionPaymentSchema,
  extendTrialSchema,
  platformChangePlanSchema,
  platformSubscriptionListSchema,
  selectPlanSchema,
  subscriptionActionSchema,
} from "@allshops/contracts";
import { RequirePermission } from "./permissions.decorator.js";
import { Public } from "./public.decorator.js";
import type { RequestContext } from "./security.types.js";
import { SubscriptionsService } from "./subscriptions.service.js";
import { assertUuid, parseInput } from "./validation.js";

@ApiTags("Plans and merchant subscriptions")
@Controller()
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Public()
  @Get("plans")
  plans() {
    return this.subscriptions.plans();
  }

  @ApiBearerAuth()
  @RequirePermission("billing.read")
  @Get("organizations/:organizationId/subscription")
  details(@Req() request: RequestContext) {
    return this.subscriptions.details(request.tenant!.organizationId);
  }

  @ApiBearerAuth()
  @RequirePermission("billing.read")
  @Get("organizations/:organizationId/subscription/usage")
  usage(@Req() request: RequestContext) {
    return this.subscriptions.usage(request.tenant!.organizationId);
  }

  @ApiBearerAuth()
  @RequirePermission("billing.manage")
  @Post("organizations/:organizationId/subscription/select-plan")
  select(@Body() body: unknown, @Req() request: RequestContext) {
    return this.subscriptions.selectPlan(
      request.tenant!.organizationId,
      request.user!.id,
      parseInput(selectPlanSchema, body),
    );
  }

  @ApiBearerAuth()
  @RequirePermission("billing.manage")
  @Post("organizations/:organizationId/subscription/cancel")
  cancel(@Req() request: RequestContext) {
    return this.subscriptions.cancel(
      request.tenant!.organizationId,
      request.user!.id,
    );
  }

  @ApiBearerAuth()
  @RequirePermission("billing.manage")
  @Post("organizations/:organizationId/subscription/resume")
  resume(@Req() request: RequestContext) {
    return this.subscriptions.resume(
      request.tenant!.organizationId,
      request.user!.id,
    );
  }

  @ApiBearerAuth()
  @RequirePermission("billing.read")
  @Get("organizations/:organizationId/billing")
  billing(@Req() request: RequestContext) {
    return this.subscriptions.billing(request.tenant!.organizationId);
  }
}

@ApiTags("Platform subscription administration")
@ApiBearerAuth()
@Controller("platform/subscriptions")
export class PlatformSubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  list(@Query() query: unknown, @Req() request: RequestContext) {
    return this.subscriptions.platformList(
      request.user!.isPlatformAdmin,
      parseInput(platformSubscriptionListSchema, query),
    );
  }

  @Get(":subscriptionId")
  get(@Param("subscriptionId") id: string, @Req() request: RequestContext) {
    return this.subscriptions.platformGet(
      request.user!.isPlatformAdmin,
      assertUuid(id, "subscriptionId"),
    );
  }

  @Post(":subscriptionId/confirm-payment")
  confirm(
    @Param("subscriptionId") id: string,
    @Headers("idempotency-key") key: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.subscriptions.confirmPayment(
      request.user!.id,
      request.user!.isPlatformAdmin,
      assertUuid(id, "subscriptionId"),
      assertUuid(key, "Idempotency-Key"),
      parseInput(confirmSubscriptionPaymentSchema, body),
    );
  }

  @Post(":subscriptionId/extend-trial")
  extend(
    @Param("subscriptionId") id: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.subscriptions.extendTrial(
      request.user!.id,
      request.user!.isPlatformAdmin,
      assertUuid(id, "subscriptionId"),
      parseInput(extendTrialSchema, body),
    );
  }

  @Post(":subscriptionId/suspend")
  suspend(
    @Param("subscriptionId") id: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.subscriptions.suspend(
      request.user!.id,
      request.user!.isPlatformAdmin,
      assertUuid(id, "subscriptionId"),
      parseInput(subscriptionActionSchema, body),
    );
  }

  @Post(":subscriptionId/reactivate")
  reactivate(
    @Param("subscriptionId") id: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.subscriptions.reactivate(
      request.user!.id,
      request.user!.isPlatformAdmin,
      assertUuid(id, "subscriptionId"),
      parseInput(subscriptionActionSchema, body),
    );
  }

  @Post(":subscriptionId/change-plan")
  changePlan(
    @Param("subscriptionId") id: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.subscriptions.changePlan(
      request.user!.id,
      request.user!.isPlatformAdmin,
      assertUuid(id, "subscriptionId"),
      parseInput(platformChangePlanSchema, body),
    );
  }
}
