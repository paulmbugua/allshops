import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { prisma } from "@allshops/database";
import { RequirePermission } from "./permissions.decorator.js";
import type { RequestContext } from "./security.types.js";
import { PilotService } from "./pilot.service.js";

@ApiTags("Pilot")
@ApiBearerAuth()
@Controller()
export class PilotController {
  constructor(private readonly pilot: PilotService) {}

  @RequirePermission("organization.read")
  @Get("organizations/:organizationId/onboarding")
  onboarding(@Param("organizationId") organizationId: string) { return this.pilot.getOnboarding(organizationId); }

  @RequirePermission("organization.update")
  @Post("organizations/:organizationId/onboarding/:stepCode/complete")
  complete(@Param("organizationId") organizationId: string, @Param("stepCode") stepCode: string, @Req() request: RequestContext) { return this.pilot.completeStep(organizationId, stepCode, request.user!.id); }

  @RequirePermission("organization.read")
  @Get("organizations/:organizationId/pilot-readiness")
  readiness(@Param("organizationId") organizationId: string) { return this.pilot.readiness(organizationId); }

  @RequirePermission("organization.read")
  @Get("organizations/:organizationId/support/diagnostics")
  diagnostics(@Param("organizationId") organizationId: string) { return this.pilot.diagnostics(organizationId); }

  @Get("platform/pilots")
  list(@Req() request: RequestContext) { return this.pilot.listPilots(Boolean(request.user?.isPlatformAdmin)); }

  @Post("platform/pilots/:organizationId")
  create(@Param("organizationId") organizationId: string, @Req() request: RequestContext) { return this.pilot.createOrGetPilot(organizationId, Boolean(request.user?.isPlatformAdmin)); }

  @Post("platform/pilots/:organizationId/:action")
  transition(@Param("organizationId") organizationId: string, @Param("action") action: string, @Body() body: { reason?: string }, @Req() request: RequestContext) {
    const target = ({ activate: "PILOT_ACTIVE", pause: "PAUSED", resume: "PILOT_ACTIVE", graduate: "GRADUATED", exit: "EXITED", onboard: "ONBOARDING", ready: "READY_FOR_UAT" } as Record<string, string>)[action];
    if (!target) throw new Error("Unknown pilot action");
    return this.pilot.transition(organizationId, target, Boolean(request.user?.isPlatformAdmin), request.user!.id, body?.reason);
  }

  @Post("platform/pilots/:organizationId/flags/:featureCode")
  flag(@Param("organizationId") organizationId: string, @Param("featureCode") featureCode: string, @Body() body: { enabled?: boolean }, @Req() request: RequestContext) {
    return this.pilot.setFlag(organizationId, featureCode, body?.enabled === true, Boolean(request.user?.isPlatformAdmin));
  }

  @Get("platform/support/issues")
  platformIssues(@Req() request: RequestContext) { return this.pilot.platformIssues(Boolean(request.user?.isPlatformAdmin)); }

  @Get("platform/feedback")
  platformFeedback(@Req() request: RequestContext) { return this.pilot.platformFeedback(Boolean(request.user?.isPlatformAdmin)); }

  @RequirePermission("organization.update")
  @Post("organizations/:organizationId/feedback")
  feedback(@Param("organizationId") organizationId: string, @Body() body: { category: string; title: string; description: string }, @Req() request: RequestContext) { return this.pilot.feedback(organizationId, request.user!.id, body); }
}

@ApiTags("Support")
@ApiBearerAuth()
@Controller("organizations/:organizationId/support/issues")
export class SupportController {
  @RequirePermission("organization.read")
  @Get()
  list(@Param("organizationId") organizationId: string) { return prisma.supportIssue.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 100 }); }

  @RequirePermission("organization.update")
  @Post()
  async create(@Param("organizationId") organizationId: string, @Body() body: Record<string, unknown>, @Req() request: RequestContext) {
    const title = String(body.title ?? "").trim(); const description = String(body.description ?? "").trim();
    if (!title || !description || title.length > 200 || description.length > 10_000) throw new Error("A valid support title and description are required.");
    return prisma.supportIssue.create({ data: { organizationId, reportedBy: request.user!.id, category: (body.category as never) ?? "OTHER", severity: (body.severity as never) ?? "MEDIUM", title, description, requestId: request.requestId, invoiceNumber: typeof body.invoiceNumber === "string" ? body.invoiceNumber : undefined, localReference: typeof body.localReference === "string" ? body.localReference : undefined, appVersion: process.env.APP_VERSION } });
  }
}
