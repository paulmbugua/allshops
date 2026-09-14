import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import {
  appointmentCancelSchema,
  appointmentCheckoutSchema,
  appointmentListSchema,
  availabilityLookupSchema,
  commissionListSchema,
  commissionRuleListSchema,
  createAppointmentSchema,
  createCommissionRuleSchema,
  createStaffSchema,
  idempotencyKeySchema,
  serviceProfileSchema,
  staffAvailabilitySchema,
  staffBranchSchema,
  staffListSchema,
  staffServiceSchema,
  staffTimeOffListSchema,
  staffTimeOffSchema,
  updateAppointmentSchema,
  updateCommissionRuleSchema,
  updateStaffSchema,
  updateStaffServiceSchema,
} from "@allshops/contracts";
import { RequirePermission } from "./permissions.decorator.js";
import { Phase5Service } from "./phase5.service.js";
import { SalesService } from "./sales.service.js";
import type { RequestContext } from "./security.types.js";
import { assertUuid, parseInput } from "./validation.js";

const key = (value?: string) => parseInput(idempotencyKeySchema, value);
const idempotencyHeader = {
  name: "Idempotency-Key",
  required: true,
  description: "UUID preventing duplicate appointment checkout",
};

@ApiTags("Services, staff, appointments and commissions")
@ApiBearerAuth()
@Controller("organizations/:organizationId")
export class Phase5Controller {
  constructor(
    private readonly phase5: Phase5Service,
    private readonly sales: SalesService,
  ) {}

  @RequirePermission("catalogue.read")
  @Get("products/:productId/service-profile")
  serviceProfile(
    @Param("productId") productId: string,
    @Req() request: RequestContext,
  ) {
    return this.phase5.serviceProfile(
      request.tenant!,
      assertUuid(productId, "productId"),
    );
  }

  @RequirePermission("product.update")
  @Put("products/:productId/service-profile")
  upsertServiceProfile(
    @Param("productId") productId: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.phase5.upsertServiceProfile(
      request.tenant!,
      request.user!.id,
      assertUuid(productId, "productId"),
      parseInput(serviceProfileSchema, body),
    );
  }

  @RequirePermission("staff.create")
  @Post("staff")
  createStaff(@Body() body: unknown, @Req() request: RequestContext) {
    return this.phase5.createStaff(
      request.tenant!,
      request.user!.id,
      parseInput(createStaffSchema, body),
    );
  }

  @RequirePermission("staff.read")
  @Get("staff")
  staff(@Query() query: unknown, @Req() request: RequestContext) {
    return this.phase5.staff(
      request.tenant!,
      parseInput(staffListSchema, query),
    );
  }

  @RequirePermission("staff.read")
  @Get("staff/:staffId")
  staffDetail(
    @Param("staffId") staffId: string,
    @Req() request: RequestContext,
  ) {
    return this.phase5.staffDetail(
      request.tenant!,
      assertUuid(staffId, "staffId"),
    );
  }

  @RequirePermission("staff.update")
  @Patch("staff/:staffId")
  updateStaff(
    @Param("staffId") staffId: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.phase5.updateStaff(
      request.tenant!,
      request.user!.id,
      assertUuid(staffId, "staffId"),
      parseInput(updateStaffSchema, body),
    );
  }

  @RequirePermission("staff.update")
  @Post("staff/:staffId/services")
  assignService(
    @Param("staffId") staffId: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.phase5.assignService(
      request.tenant!,
      request.user!.id,
      assertUuid(staffId, "staffId"),
      parseInput(staffServiceSchema, body),
    );
  }

  @RequirePermission("staff.read")
  @Get("staff/:staffId/services")
  staffServices(
    @Param("staffId") staffId: string,
    @Req() request: RequestContext,
  ) {
    return this.phase5.staffServices(
      request.tenant!,
      assertUuid(staffId, "staffId"),
    );
  }

  @RequirePermission("staff.update")
  @Patch("staff/:staffId/services/:staffServiceId")
  updateStaffService(
    @Param("staffId") staffId: string,
    @Param("staffServiceId") staffServiceId: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.phase5.updateStaffService(
      request.tenant!,
      request.user!.id,
      assertUuid(staffId, "staffId"),
      assertUuid(staffServiceId, "staffServiceId"),
      parseInput(updateStaffServiceSchema, body),
    );
  }

  @RequirePermission("staff.update")
  @Post("staff/:staffId/branches")
  assignBranch(
    @Param("staffId") staffId: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.phase5.assignBranch(
      request.tenant!,
      request.user!.id,
      assertUuid(staffId, "staffId"),
      parseInput(staffBranchSchema, body),
    );
  }

  @RequirePermission("staff.read")
  @Get("staff/:staffId/branches")
  staffBranches(
    @Param("staffId") staffId: string,
    @Req() request: RequestContext,
  ) {
    return this.phase5.staffBranches(
      request.tenant!,
      assertUuid(staffId, "staffId"),
    );
  }

  @RequirePermission("staff_availability.read")
  @Get("staff/:staffId/availability")
  availability(
    @Param("staffId") staffId: string,
    @Req() request: RequestContext,
  ) {
    return this.phase5.availability(
      request.tenant!,
      assertUuid(staffId, "staffId"),
    );
  }

  @RequirePermission("staff_availability.manage")
  @Put("staff/:staffId/availability")
  replaceAvailability(
    @Param("staffId") staffId: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.phase5.replaceAvailability(
      request.tenant!,
      request.user!.id,
      assertUuid(staffId, "staffId"),
      parseInput(staffAvailabilitySchema, body),
    );
  }

  @RequirePermission("staff_availability.manage")
  @Post("staff/:staffId/time-off")
  createTimeOff(
    @Param("staffId") staffId: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.phase5.createTimeOff(
      request.tenant!,
      request.user!.id,
      assertUuid(staffId, "staffId"),
      parseInput(staffTimeOffSchema, body),
    );
  }

  @RequirePermission("staff_availability.read")
  @Get("staff/:staffId/time-off")
  timeOff(
    @Param("staffId") staffId: string,
    @Query() query: unknown,
    @Req() request: RequestContext,
  ) {
    return this.phase5.timeOff(
      request.tenant!,
      assertUuid(staffId, "staffId"),
      parseInput(staffTimeOffListSchema, query),
    );
  }

  @RequirePermission("appointment.read")
  @Get("appointments/availability")
  lookupAvailability(@Query() query: unknown, @Req() request: RequestContext) {
    return this.phase5.lookupAvailability(
      request.tenant!,
      parseInput(availabilityLookupSchema, query),
    );
  }

  @RequirePermission("appointment.create")
  @Post("appointments")
  createAppointment(@Body() body: unknown, @Req() request: RequestContext) {
    return this.phase5.createAppointment(
      request.tenant!,
      request.user!.id,
      parseInput(createAppointmentSchema, body),
    );
  }

  @RequirePermission("appointment.read")
  @Get("appointments")
  appointments(@Query() query: unknown, @Req() request: RequestContext) {
    return this.phase5.appointments(
      request.tenant!,
      request.user!.id,
      parseInput(appointmentListSchema, query),
    );
  }

  @RequirePermission("appointment.read")
  @Get("appointments/:appointmentId")
  appointment(
    @Param("appointmentId") appointmentId: string,
    @Req() request: RequestContext,
  ) {
    return this.phase5.appointment(
      request.tenant!,
      request.user!.id,
      assertUuid(appointmentId, "appointmentId"),
    );
  }

  @RequirePermission("appointment.update")
  @Patch("appointments/:appointmentId")
  updateAppointment(
    @Param("appointmentId") appointmentId: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.phase5.updateAppointment(
      request.tenant!,
      request.user!.id,
      assertUuid(appointmentId, "appointmentId"),
      parseInput(updateAppointmentSchema, body),
    );
  }

  @RequirePermission("appointment.confirm")
  @Post("appointments/:appointmentId/confirm")
  confirm(@Param("appointmentId") id: string, @Req() request: RequestContext) {
    return this.phase5.transition(
      request.tenant!,
      request.user!.id,
      assertUuid(id, "appointmentId"),
      "confirm",
    );
  }

  @RequirePermission("appointment.start")
  @Post("appointments/:appointmentId/start")
  start(@Param("appointmentId") id: string, @Req() request: RequestContext) {
    return this.phase5.transition(
      request.tenant!,
      request.user!.id,
      assertUuid(id, "appointmentId"),
      "start",
    );
  }

  @RequirePermission("appointment.complete")
  @Post("appointments/:appointmentId/complete")
  complete(@Param("appointmentId") id: string, @Req() request: RequestContext) {
    return this.phase5.transition(
      request.tenant!,
      request.user!.id,
      assertUuid(id, "appointmentId"),
      "complete",
    );
  }

  @RequirePermission("appointment.cancel")
  @Post("appointments/:appointmentId/cancel")
  cancel(
    @Param("appointmentId") id: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.phase5.transition(
      request.tenant!,
      request.user!.id,
      assertUuid(id, "appointmentId"),
      "cancel",
      parseInput(appointmentCancelSchema, body),
    );
  }

  @RequirePermission("appointment.no_show")
  @Post("appointments/:appointmentId/no-show")
  noShow(@Param("appointmentId") id: string, @Req() request: RequestContext) {
    return this.phase5.transition(
      request.tenant!,
      request.user!.id,
      assertUuid(id, "appointmentId"),
      "no-show",
    );
  }

  @ApiHeader(idempotencyHeader)
  @RequirePermission("appointment.checkout", "sale.create", "payment.record")
  @Post("appointments/:appointmentId/checkout")
  checkout(
    @Param("appointmentId") id: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: RequestContext,
  ) {
    return this.sales.checkoutAppointment(
      request.tenant!,
      request.user!.id,
      assertUuid(id, "appointmentId"),
      parseInput(appointmentCheckoutSchema, body),
      key(idempotencyKey),
    );
  }

  @RequirePermission("commission_rule.create")
  @Post("commission-rules")
  createCommissionRule(@Body() body: unknown, @Req() request: RequestContext) {
    return this.phase5.createCommissionRule(
      request.tenant!,
      request.user!.id,
      parseInput(createCommissionRuleSchema, body),
    );
  }

  @RequirePermission("commission_rule.read")
  @Get("commission-rules")
  commissionRules(@Query() query: unknown, @Req() request: RequestContext) {
    return this.phase5.commissionRules(
      request.tenant!,
      parseInput(commissionRuleListSchema, query),
    );
  }

  @RequirePermission("commission_rule.read")
  @Get("commission-rules/:ruleId")
  commissionRule(@Param("ruleId") id: string, @Req() request: RequestContext) {
    return this.phase5.commissionRule(
      request.tenant!,
      assertUuid(id, "ruleId"),
    );
  }

  @RequirePermission("commission_rule.update")
  @Patch("commission-rules/:ruleId")
  updateCommissionRule(
    @Param("ruleId") id: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.phase5.updateCommissionRule(
      request.tenant!,
      request.user!.id,
      assertUuid(id, "ruleId"),
      parseInput(updateCommissionRuleSchema, body),
    );
  }

  @RequirePermission("commission.read")
  @Get("commissions/summary")
  commissionSummary(@Query() query: unknown, @Req() request: RequestContext) {
    return this.phase5.commissionSummary(
      request.tenant!,
      request.user!.id,
      parseInput(commissionListSchema, query),
    );
  }

  @RequirePermission("commission.read")
  @Get("commissions")
  commissions(@Query() query: unknown, @Req() request: RequestContext) {
    return this.phase5.commissions(
      request.tenant!,
      request.user!.id,
      parseInput(commissionListSchema, query),
    );
  }
}
