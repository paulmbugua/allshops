import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { cashMovementSchema, closeShiftSchema, openShiftSchema } from "@allshops/contracts";
import { RequirePermission } from "./permissions.decorator.js";
import { RegisterShiftsService } from "./register-shifts.service.js";
import type { RequestContext } from "./security.types.js";
import { assertUuid, parseInput } from "./validation.js";

@ApiTags("Register shifts")
@ApiBearerAuth()
@Controller()
export class RegisterShiftsController {
  constructor(private readonly shifts: RegisterShiftsService) {}

  @RequirePermission("shift.open")
  @Post("organizations/:organizationId/register-shifts")
  open(@Body() body: unknown, @Req() req: RequestContext) {
    return this.shifts.open(req.tenant!, req.user!.id, parseInput(openShiftSchema, body));
  }

  @RequirePermission("shift.read")
  @Get("organizations/:organizationId/register-shifts")
  list(@Req() req: RequestContext) { return this.shifts.list(req.tenant!); }

  @RequirePermission("shift.cash_movement")
  @Post("organizations/:organizationId/register-shifts/:shiftId/movements")
  movement(@Param("shiftId") id: string, @Body() body: unknown, @Req() req: RequestContext) {
    return this.shifts.movement(req.tenant!, req.user!.id, assertUuid(id, "shiftId"), parseInput(cashMovementSchema, body));
  }

  @RequirePermission("shift.close")
  @Patch("organizations/:organizationId/register-shifts/:shiftId/close")
  close(@Param("shiftId") id: string, @Body() body: unknown, @Req() req: RequestContext) {
    return this.shifts.close(req.tenant!, req.user!.id, assertUuid(id, "shiftId"), parseInput(closeShiftSchema, body));
  }

  @RequirePermission("shift.approve")
  @Patch("organizations/:organizationId/register-shifts/:shiftId/approve")
  approve(@Param("shiftId") id: string, @Req() req: RequestContext) {
    return this.shifts.approve(req.tenant!, req.user!.id, assertUuid(id, "shiftId"));
  }
}
