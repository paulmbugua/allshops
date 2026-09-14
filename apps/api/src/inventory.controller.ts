import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiHeader, ApiTags } from "@nestjs/swagger";
import {
  adjustmentSchema,
  createTransferSchema,
  idempotencyKeySchema,
  inventoryFilterSchema,
  movementFilterSchema,
  openingStockSchema,
  transferListSchema,
} from "@allshops/contracts";
import { InventoryService } from "./inventory.service.js";
import { RequirePermission } from "./permissions.decorator.js";
import type { RequestContext } from "./security.types.js";
import { assertUuid, parseInput } from "./validation.js";

const optionalIdempotencyKey = (value?: string) =>
  value === undefined ? undefined : parseInput(idempotencyKeySchema, value);

@ApiTags("Inventory")
@ApiBearerAuth()
@Controller("organizations/:organizationId")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @RequirePermission("inventory.read")
  @Get("stock-locations")
  locations(
    @Query("branchId") branchId: string | undefined,
    @Req() request: RequestContext,
  ) {
    return this.inventory.locations(
      request.tenant!,
      branchId ? assertUuid(branchId, "branchId") : undefined,
    );
  }

  @RequirePermission("inventory.read")
  @Get("inventory")
  balances(@Query() query: unknown, @Req() request: RequestContext) {
    return this.inventory.balances(
      request.tenant!,
      parseInput(inventoryFilterSchema, query),
    );
  }
  @RequirePermission("inventory.read")
  @Get("inventory/movements")
  movements(@Query() query: unknown, @Req() request: RequestContext) {
    return this.inventory.movements(
      request.tenant!,
      parseInput(movementFilterSchema, query),
    );
  }
  @RequirePermission("inventory.read")
  @Get("inventory/reconciliation")
  reconcile(@Req() request: RequestContext) {
    return this.inventory.reconcile(request.tenant!);
  }

  @ApiHeader({
    name: "Idempotency-Key",
    required: false,
    description: "UUID used to safely retry the mutation",
  })
  @ApiBody({
    schema: {
      example: {
        branchId: "uuid",
        locationId: "uuid",
        productId: "uuid",
        variantId: null,
        quantity: "100.0000",
        unitCostMinor: 150,
      },
    },
  })
  @RequirePermission("inventory.opening")
  @Post("inventory/opening-stock")
  opening(
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: RequestContext,
  ) {
    return this.inventory.opening(
      request.tenant!,
      request.user!.id,
      parseInput(openingStockSchema, body),
      optionalIdempotencyKey(key),
    );
  }

  @ApiHeader({
    name: "Idempotency-Key",
    required: false,
    description: "UUID used to safely retry the mutation",
  })
  @ApiBody({
    schema: {
      example: {
        branchId: "uuid",
        locationId: "uuid",
        productId: "uuid",
        variantId: null,
        direction: "OUT",
        quantity: "3.0000",
        reason: "Damaged stock",
      },
    },
  })
  @RequirePermission("inventory.adjust")
  @Post("inventory/adjustments")
  adjustment(
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: RequestContext,
  ) {
    return this.inventory.adjustment(
      request.tenant!,
      request.user!.id,
      parseInput(adjustmentSchema, body),
      optionalIdempotencyKey(key),
    );
  }

  @ApiHeader({
    name: "Idempotency-Key",
    required: false,
    description: "UUID used to safely retry the mutation",
  })
  @ApiBody({
    schema: {
      example: {
        fromBranchId: "uuid",
        fromLocationId: "uuid",
        toBranchId: "uuid",
        toLocationId: "uuid",
        notes: "Restock second branch",
        items: [
          {
            productId: "uuid",
            variantId: null,
            quantity: "20.0000",
            unitCostMinor: 150,
          },
        ],
      },
    },
  })
  @RequirePermission("inventory.transfer")
  @Post("inventory/transfers")
  createTransfer(
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: RequestContext,
  ) {
    return this.inventory.createTransfer(
      request.tenant!,
      request.user!.id,
      parseInput(createTransferSchema, body),
      optionalIdempotencyKey(key),
    );
  }
  @RequirePermission("inventory.read")
  @Get("inventory/transfers")
  transfers(@Query() query: unknown, @Req() request: RequestContext) {
    return this.inventory.transfers(
      request.tenant!,
      parseInput(transferListSchema, query),
    );
  }
  @RequirePermission("inventory.read")
  @Get("inventory/transfers/:transferId")
  transfer(@Param("transferId") id: string, @Req() request: RequestContext) {
    return this.inventory.transfer(
      request.tenant!,
      assertUuid(id, "transferId"),
    );
  }

  @ApiHeader({
    name: "Idempotency-Key",
    required: false,
    description: "UUID used to safely retry the mutation",
  })
  @RequirePermission("inventory.transfer")
  @Post("inventory/transfers/:transferId/send")
  send(
    @Param("transferId") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: RequestContext,
  ) {
    return this.inventory.send(
      request.tenant!,
      request.user!.id,
      assertUuid(id, "transferId"),
      optionalIdempotencyKey(key),
    );
  }
  @ApiHeader({
    name: "Idempotency-Key",
    required: false,
    description: "UUID used to safely retry the mutation",
  })
  @RequirePermission("inventory.transfer.receive")
  @Post("inventory/transfers/:transferId/receive")
  receive(
    @Param("transferId") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: RequestContext,
  ) {
    return this.inventory.receive(
      request.tenant!,
      request.user!.id,
      assertUuid(id, "transferId"),
      optionalIdempotencyKey(key),
    );
  }
  @RequirePermission("inventory.transfer")
  @Post("inventory/transfers/:transferId/cancel")
  cancel(@Param("transferId") id: string, @Req() request: RequestContext) {
    return this.inventory.cancel(
      request.tenant!,
      request.user!.id,
      assertUuid(id, "transferId"),
    );
  }
}
