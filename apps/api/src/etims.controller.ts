import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  fiscalDocumentListSchema,
  retryFiscalDocumentSchema,
  upsertEtimsBranchSchema,
  upsertEtimsIntegrationSchema,
  upsertEtimsProductMappingSchema,
} from "@allshops/contracts";
import { EtimsService } from "./etims.service.js";
import { RequirePermission } from "./permissions.decorator.js";
import type { RequestContext } from "./security.types.js";
import { assertUuid, parseInput } from "./validation.js";

@ApiTags("KRA eTIMS")
@ApiBearerAuth()
@Controller("organizations/:organizationId/etims")
export class EtimsController {
  constructor(private readonly etims: EtimsService) {}

  @RequirePermission("etims.read")
  @Get()
  overview(@Req() request: RequestContext) {
    return this.etims.overview(request.tenant!);
  }

  @RequirePermission("etims.manage")
  @Put("configuration")
  configure(@Body() body: unknown, @Req() request: RequestContext) {
    return this.etims.upsertIntegration(
      request.tenant!,
      request.user!.id,
      parseInput(upsertEtimsIntegrationSchema, body),
    );
  }

  @RequirePermission("etims.manage")
  @Put("branches")
  branch(@Body() body: unknown, @Req() request: RequestContext) {
    return this.etims.upsertBranch(
      request.tenant!,
      request.user!.id,
      parseInput(upsertEtimsBranchSchema, body),
    );
  }

  @RequirePermission("etims.manage")
  @Put("products")
  product(@Body() body: unknown, @Req() request: RequestContext) {
    return this.etims.upsertProductMapping(
      request.tenant!,
      request.user!.id,
      parseInput(upsertEtimsProductMappingSchema, body),
    );
  }

  @RequirePermission("etims.read")
  @Get("products")
  products(@Req() request: RequestContext) {
    return this.etims.productMappings(request.tenant!);
  }

  @RequirePermission("etims.read")
  @Get("documents")
  documents(@Query() query: unknown, @Req() request: RequestContext) {
    return this.etims.documents(
      request.tenant!,
      parseInput(fiscalDocumentListSchema, query),
    );
  }

  @RequirePermission("etims.retry")
  @Post("documents/:documentId/retry")
  retry(
    @Param("documentId") documentId: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.etims.retry(
      request.tenant!,
      request.user!.id,
      assertUuid(documentId, "documentId"),
      parseInput(retryFiscalDocumentSchema, body),
    );
  }
}
