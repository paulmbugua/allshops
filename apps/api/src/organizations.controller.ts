import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
} from "@allshops/contracts";
import { RequirePermission } from "./permissions.decorator.js";
import type { RequestContext } from "./security.types.js";
import { OrganizationsService } from "./organizations.service.js";
import { parseInput } from "./validation.js";

@ApiTags("Organizations")
@ApiBearerAuth()
@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  create(@Body() body: unknown, @Req() request: RequestContext) {
    return this.organizations.create(
      request.user!.id,
      parseInput(createOrganizationSchema, body),
    );
  }

  @RequirePermission("organization.read")
  @Get(":organizationId")
  get(@Param("organizationId") organizationId: string) {
    return this.organizations.get(organizationId);
  }

  @RequirePermission("organization.update")
  @Patch(":organizationId")
  update(
    @Param("organizationId") organizationId: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.organizations.update(
      organizationId,
      request.user!.id,
      parseInput(updateOrganizationSchema, body),
    );
  }
}
