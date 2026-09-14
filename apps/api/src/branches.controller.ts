import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createBranchSchema, updateBranchSchema } from "@allshops/contracts";
import { BranchesService } from "./branches.service.js";
import { RequirePermission } from "./permissions.decorator.js";
import type { RequestContext } from "./security.types.js";
import { assertUuid, parseInput } from "./validation.js";

@ApiTags("Branches")
@ApiBearerAuth()
@Controller("organizations/:organizationId/branches")
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @RequirePermission("branch.create")
  @Post()
  create(@Body() body: unknown, @Req() request: RequestContext) {
    return this.branches.create(
      request.tenant!,
      request.user!.id,
      parseInput(createBranchSchema, body),
    );
  }

  @RequirePermission("branch.read")
  @Get()
  list(@Req() request: RequestContext) {
    return this.branches.list(request.tenant!);
  }

  @RequirePermission("branch.read")
  @Get(":branchId")
  get(@Param("branchId") branchId: string, @Req() request: RequestContext) {
    return this.branches.get(request.tenant!, assertUuid(branchId, "branchId"));
  }

  @RequirePermission("branch.update")
  @Patch(":branchId")
  update(
    @Param("branchId") branchId: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.branches.update(
      request.tenant!,
      request.user!.id,
      assertUuid(branchId, "branchId"),
      parseInput(updateBranchSchema, body),
    );
  }
}
