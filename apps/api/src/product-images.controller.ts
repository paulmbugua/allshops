import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { RequireAnyPermission } from "./permissions.decorator.js";
import { ProductImagesService } from "./product-images.service.js";
import type { ProductImageUpload } from "./product-images.service.js";
import { Public } from "./public.decorator.js";
import { assertUuid } from "./validation.js";

@ApiTags("Catalogue")
@ApiBearerAuth()
@Controller("organizations/:organizationId/product-images")
export class ProductImageUploadsController {
  constructor(private readonly images: ProductImagesService) {}

  @RequireAnyPermission("product.create", "product.update")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("image", {
      limits: { files: 1, fileSize: 5 * 1024 * 1024 },
    }),
  )
  @Post()
  upload(
    @Param("organizationId") organizationId: string,
    @UploadedFile() file?: ProductImageUpload,
  ) {
    return this.images.save(assertUuid(organizationId, "organizationId"), file);
  }
}

@ApiTags("Product images")
@Public()
@Controller("product-images")
export class ProductImagesController {
  constructor(private readonly images: ProductImagesService) {}

  @Header("Content-Type", "image/webp")
  @Header("Cache-Control", "public, max-age=31536000, immutable")
  @Header("X-Content-Type-Options", "nosniff")
  @Get(":organizationId/:filename")
  async image(
    @Param("organizationId") organizationId: string,
    @Param("filename") filename: string,
  ) {
    return new StreamableFile(
      await this.images.read(
        assertUuid(organizationId, "organizationId"),
        filename,
      ),
    );
  }
}
