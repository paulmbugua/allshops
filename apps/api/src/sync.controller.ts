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
  conflictResolutionSchema,
  registerDeviceSchema,
  renameDeviceSchema,
  syncListSchema,
  syncSalesBatchSchema,
} from "@allshops/contracts";
import { RequirePermission } from "./permissions.decorator.js";
import type { RequestContext } from "./security.types.js";
import { SyncService } from "./sync.service.js";
import { assertUuid, parseInput } from "./validation.js";

@ApiTags("Offline POS devices and synchronization")
@ApiBearerAuth()
@Controller("organizations/:organizationId")
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @RequirePermission("device.register")
  @Post("devices/register")
  register(@Body() body: unknown, @Req() request: RequestContext) {
    return this.sync.registerDevice(
      request.tenant!,
      request.user!.id,
      parseInput(registerDeviceSchema, body),
    );
  }

  @RequirePermission("device.read")
  @Get("devices")
  devices(@Req() request: RequestContext) {
    return this.sync.devices(request.tenant!);
  }

  @RequirePermission("device.manage")
  @Patch("devices/:deviceId")
  rename(
    @Param("deviceId") deviceId: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.sync.renameDevice(
      request.tenant!,
      request.user!.id,
      assertUuid(deviceId, "deviceId"),
      parseInput(renameDeviceSchema, body),
    );
  }

  @RequirePermission("device.manage")
  @Post("devices/:deviceId/revoke")
  revoke(@Param("deviceId") deviceId: string, @Req() request: RequestContext) {
    return this.sync.revokeDevice(
      request.tenant!,
      request.user!.id,
      assertUuid(deviceId, "deviceId"),
    );
  }

  @RequirePermission("sync.execute")
  @Get("sync/bootstrap")
  bootstrap(
    @Query("deviceId") deviceId: string,
    @Req() request: RequestContext,
  ) {
    return this.sync.bootstrap(
      request.tenant!,
      request.user!.id,
      assertUuid(deviceId, "deviceId"),
    );
  }

  @RequirePermission("sync.execute")
  @Post("sync/sales")
  sales(@Body() body: unknown, @Req() request: RequestContext) {
    return this.sync.syncSales(
      request.tenant!,
      request.user!.id,
      parseInput(syncSalesBatchSchema, body),
    );
  }

  @RequirePermission("sync.conflict.read")
  @Get("sync/conflicts")
  conflicts(@Query() query: unknown, @Req() request: RequestContext) {
    return this.sync.conflicts(
      request.tenant!,
      parseInput(syncListSchema, query),
    );
  }

  @RequirePermission("sync.conflict.resolve")
  @Post("sync/conflicts/:transactionUuid/resolve")
  resolve(
    @Param("transactionUuid") transactionUuid: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.sync.resolve(
      request.tenant!,
      request.user!.id,
      assertUuid(transactionUuid, "transactionUuid"),
      parseInput(conflictResolutionSchema, body),
    );
  }

  @RequirePermission("sync.read")
  @Get("devices/:deviceId/sync-status")
  status(@Param("deviceId") deviceId: string, @Req() request: RequestContext) {
    return this.sync.syncStatus(
      request.tenant!,
      assertUuid(deviceId, "deviceId"),
    );
  }
}
