import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
} from "@allshops/contracts";
import { RequirePermission } from "./permissions.decorator.js";
import type { RequestContext } from "./security.types.js";
import { OrganizationsService } from "./organizations.service.js";
import { assertUuid, parseInput } from "./validation.js";
import { Public } from "./public.decorator.js";
import {
  ProductImagesService,
  type ProductImageUpload,
} from "./product-images.service.js";

@ApiTags("Organizations")
@ApiBearerAuth()
@Controller("organizations")
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly images: ProductImagesService,
  ) {}

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

  @Public()
  @Get(":organizationId/welcome")
  welcome(@Param("organizationId") organizationId: string) {
    return this.organizations.welcome(
      assertUuid(organizationId, "organizationId"),
    );
  }

  @RequirePermission("organization.update")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("image", {
      limits: { files: 1, fileSize: 5 * 1024 * 1024 },
    }),
  )
  @Post(":organizationId/logo")
  async logo(
    @Param("organizationId") organizationId: string,
    @UploadedFile() file: ProductImageUpload | undefined,
    @Req() request: RequestContext,
  ) {
    const id = assertUuid(organizationId, "organizationId");
    const upload = await this.images.save(id, file, "company logo");
    return this.organizations.update(id, request.user!.id, {
      logoUrl: upload.imageUrl,
    });
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
