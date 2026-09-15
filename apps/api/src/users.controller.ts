import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { inviteUserSchema, updateMembershipSchema } from "@allshops/contracts";
import { RequirePermission } from "./permissions.decorator.js";
import type { RequestContext } from "./security.types.js";
import { UsersService } from "./users.service.js";
import { assertUuid, parseInput } from "./validation.js";

@ApiTags("Organization users")
@ApiBearerAuth()
@Controller("organizations/:organizationId/users")
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @RequirePermission("user.read")
  @Get()
  list(@Req() request: RequestContext) {
    return this.users.list(request.tenant!);
  }
  @RequirePermission("user.invite", "role.assign")
  @Post()
  invite(@Body() body: unknown, @Req() request: RequestContext) {
    return this.users.invite(
      request.tenant!,
      request.user!.id,
      parseInput(inviteUserSchema, body),
    );
  }
  @RequirePermission("user.invite")
  @Post(":membershipId/resend-invitation")
  resendInvitation(
    @Param("membershipId") membershipId: string,
    @Req() request: RequestContext,
  ) {
    return this.users.resendInvitation(
      request.tenant!,
      request.user!.id,
      assertUuid(membershipId, "membershipId"),
    );
  }
  @RequirePermission("user.update")
  @Post(":membershipId/send-password-reset")
  sendPasswordReset(
    @Param("membershipId") membershipId: string,
    @Req() request: RequestContext,
  ) {
    return this.users.sendPasswordReset(
      request.tenant!,
      request.user!.id,
      assertUuid(membershipId, "membershipId"),
    );
  }
  @RequirePermission("user.update", "role.assign")
  @Patch(":membershipId")
  update(
    @Param("membershipId") membershipId: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.users.update(
      request.tenant!,
      request.user!.id,
      assertUuid(membershipId, "membershipId"),
      parseInput(updateMembershipSchema, body),
    );
  }
}
