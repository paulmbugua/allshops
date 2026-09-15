import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  reconciliationDateSchema,
  submitReconciliationSchema,
} from "@allshops/contracts";

import {
  RequireAnyPermission,
  RequirePermission,
} from "./permissions.decorator.js";
import { ReconciliationService } from "./reconciliation.service.js";
import type { RequestContext } from "./security.types.js";
import { assertUuid, parseInput } from "./validation.js";

@ApiTags("Cashier reconciliation")
@ApiBearerAuth()
@Controller("organizations/:organizationId/reconciliations")
export class ReconciliationController {
  constructor(private readonly reconciliations: ReconciliationService) {}

  @RequireAnyPermission("reconciliation.submit", "reconciliation.read_all")
  @Get("daily")
  daily(@Query() query: unknown, @Req() request: RequestContext) {
    return this.reconciliations.daily(
      request.tenant!,
      request.user!.id,
      parseInput(reconciliationDateSchema, query),
    );
  }

  @RequirePermission("reconciliation.submit")
  @Post()
  submit(@Body() body: unknown, @Req() request: RequestContext) {
    return this.reconciliations.submit(
      request.tenant!,
      request.user!.id,
      parseInput(submitReconciliationSchema, body),
    );
  }

  @RequirePermission("reconciliation.approve")
  @Patch(":id/approve")
  approve(@Param("id") id: string, @Req() request: RequestContext) {
    return this.reconciliations.approve(
      request.tenant!,
      request.user!.id,
      assertUuid(id, "reconciliationId"),
    );
  }
}
