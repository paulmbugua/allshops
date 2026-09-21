import { Controller, Get, Param, Patch, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { alertListSchema } from "@allshops/contracts";
import { RequirePermission } from "./permissions.decorator.js";
import { AlertsService } from "./alerts.service.js";
import type { RequestContext } from "./security.types.js";
import { assertUuid, parseInput } from "./validation.js";

@ApiTags("Operational alerts")
@ApiBearerAuth()
@Controller("organizations/:organizationId/alerts")
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}
  @RequirePermission("alert.read")
  @Get()
  list(@Query() query: unknown, @Req() req: RequestContext) { return this.alerts.list(req.tenant!, parseInput(alertListSchema, query)); }
  @RequirePermission("alert.manage")
  @Patch(":id/acknowledge")
  acknowledge(@Param("id") id: string, @Req() req: RequestContext) { return this.alerts.acknowledge(req.tenant!, req.user!.id, assertUuid(id, "alertId")); }
  @RequirePermission("alert.manage")
  @Patch(":id/resolve")
  resolve(@Param("id") id: string, @Req() req: RequestContext) { return this.alerts.resolve(req.tenant!, req.user!.id, assertUuid(id, "alertId")); }
}
