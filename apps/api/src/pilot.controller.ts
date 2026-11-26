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
  prisma,
  SupportIssueCategory,
  SupportIssueSeverity,
  SupportIssueStatus,
} from "@allshops/database";
import { z } from "zod";
import { RequirePermission } from "./permissions.decorator.js";
import type { RequestContext } from "./security.types.js";
import { PilotService } from "./pilot.service.js";
import { assertUuid, parseInput } from "./validation.js";

const supportInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(10_000),
    category: z.nativeEnum(SupportIssueCategory).default("OTHER"),
    severity: z.nativeEnum(SupportIssueSeverity).default("MEDIUM"),
    invoiceNumber: z.string().trim().max(160).optional(),
    localReference: z.string().trim().max(160).optional(),
  })
  .strict();

const supportFilters = z.object({
  status: z.nativeEnum(SupportIssueStatus).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

const supportUpdate = z
  .object({
    status: z.nativeEnum(SupportIssueStatus),
    resolutionNote: z.string().trim().min(3).max(5000),
    updatedAt: z.string().datetime(),
  })
  .strict();

@ApiTags("Pilot")
@ApiBearerAuth()
@Controller()
export class PilotController {
  constructor(private readonly pilot: PilotService) {}

  @RequirePermission("organization.read")
  @Get("organizations/:organizationId/onboarding")
  onboarding(@Param("organizationId") organizationId: string) {
    return this.pilot.getOnboarding(organizationId);
  }

  @RequirePermission("organization.update")
  @Post("organizations/:organizationId/onboarding/:stepCode/complete")
  complete(
    @Param("organizationId") organizationId: string,
    @Param("stepCode") stepCode: string,
    @Req() request: RequestContext,
  ) {
    return this.pilot.completeStep(organizationId, stepCode, request.user!.id);
  }

  @RequirePermission("organization.read")
  @Get("organizations/:organizationId/pilot-readiness")
  readiness(@Param("organizationId") organizationId: string) {
    return this.pilot.readiness(organizationId);
  }

  @RequirePermission("organization.read")
  @Get("organizations/:organizationId/support/diagnostics")
  diagnostics(
    @Param("organizationId") organizationId: string,
    @Req() request: RequestContext,
  ) {
    return this.pilot.diagnostics(organizationId, request.tenant!);
  }

  @Get("platform/pilots")
  list(@Req() request: RequestContext) {
    return this.pilot.listPilots(Boolean(request.user?.isPlatformAdmin));
  }

  @Post("platform/pilots/:organizationId")
  create(
    @Param("organizationId") organizationId: string,
    @Req() request: RequestContext,
  ) {
    return this.pilot.createOrGetPilot(
      organizationId,
      Boolean(request.user?.isPlatformAdmin),
    );
  }

  @Post("platform/pilots/:organizationId/:action")
  transition(
    @Param("organizationId") organizationId: string,
    @Param("action") action: string,
    @Body() body: { reason?: string },
    @Req() request: RequestContext,
  ) {
    const target = (
      {
        activate: "PILOT_ACTIVE",
        pause: "PAUSED",
        resume: "PILOT_ACTIVE",
        graduate: "GRADUATED",
        exit: "EXITED",
        onboard: "ONBOARDING",
        ready: "READY_FOR_UAT",
      } as Record<string, string>
    )[action];
    if (!target) throw new Error("Unknown pilot action");
    return this.pilot.transition(
      organizationId,
      target,
      Boolean(request.user?.isPlatformAdmin),
      request.user!.id,
      body?.reason,
    );
  }

  @Post("platform/pilots/:organizationId/flags/:featureCode")
  flag(
    @Param("organizationId") organizationId: string,
    @Param("featureCode") featureCode: string,
    @Body() body: { enabled?: boolean },
    @Req() request: RequestContext,
  ) {
    return this.pilot.setFlag(
      organizationId,
      featureCode,
      body?.enabled === true,
      Boolean(request.user?.isPlatformAdmin),
    );
  }

  @Get("platform/overview")
  platformOverview(@Req() request: RequestContext) {
    return this.pilot.platformOverview(request.user!.isPlatformAdmin);
  }

  @Get("platform/support/issues")
  platformIssues(@Query() query: unknown, @Req() request: RequestContext) {
    return this.pilot.platformIssues(
      request.user!.isPlatformAdmin,
      parseInput(supportFilters, query),
    );
  }

  @Get("platform/support/issues/:issueId")
  platformIssue(@Param("issueId") id: string, @Req() request: RequestContext) {
    return this.pilot.platformIssue(
      request.user!.isPlatformAdmin,
      assertUuid(id, "issueId"),
    );
  }

  @Patch("platform/support/issues/:issueId")
  updatePlatformIssue(
    @Param("issueId") id: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.pilot.updatePlatformIssue(
      request.user!.isPlatformAdmin,
      request.user!.id,
      assertUuid(id, "issueId"),
      parseInput(supportUpdate, body),
    );
  }

  @Get("platform/feedback")
  platformFeedback(@Req() request: RequestContext) {
    return this.pilot.platformFeedback(Boolean(request.user?.isPlatformAdmin));
  }

  @RequirePermission("organization.update")
  @Post("organizations/:organizationId/feedback")
  feedback(
    @Param("organizationId") organizationId: string,
    @Body() body: { category: string; title: string; description: string },
    @Req() request: RequestContext,
  ) {
    return this.pilot.feedback(organizationId, request.user!.id, body);
  }
}

@ApiTags("Support")
@ApiBearerAuth()
@Controller("organizations/:organizationId/support/issues")
export class SupportController {
  @RequirePermission("organization.read")
  @Get()
  list(@Req() request: RequestContext) {
    return prisma.supportIssue.findMany({
      where: {
        organizationId: request.tenant!.organizationId,
        ...(request.tenant!.permissions.includes("organization.update")
          ? {}
          : { reportedBy: request.user!.id }),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  @RequirePermission("organization.read")
  @Post()
  async create(
    @Param("organizationId") organizationId: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    const input = parseInput(supportInput, body);
    return prisma.supportIssue.create({
      data: {
        organizationId,
        reportedBy: request.user!.id,
        ...input,
        branchId: request.tenant!.branchId,
        requestId: request.requestId,
        appVersion: process.env.APP_VERSION,
      },
    });
  }
}
