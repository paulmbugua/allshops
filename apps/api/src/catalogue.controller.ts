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
import { ApiBearerAuth, ApiBody, ApiTags } from "@nestjs/swagger";
import {
  catalogueListSchema,
  catalogueImportSchema,
  createBrandSchema,
  createCategorySchema,
  createProductSchema,
  createUnitSchema,
  createVariantSchema,
  productListSchema,
  updateBrandSchema,
  updateCategorySchema,
  updateProductSchema,
  updateUnitSchema,
  updateVariantSchema,
} from "@allshops/contracts";
import { CatalogueService } from "./catalogue.service.js";
import { RequirePermission } from "./permissions.decorator.js";
import type { RequestContext } from "./security.types.js";
import { assertUuid, parseInput } from "./validation.js";

@ApiTags("Catalogue")
@ApiBearerAuth()
@Controller("organizations/:organizationId")
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  @RequirePermission("category.create")
  @Post("categories")
  createCategory(@Body() body: unknown, @Req() request: RequestContext) {
    return this.catalogue.createCategory(
      request.tenant!,
      request.user!.id,
      parseInput(createCategorySchema, body),
    );
  }
  @RequirePermission("catalogue.read")
  @Get("categories")
  categories(@Query() query: unknown, @Req() request: RequestContext) {
    return this.catalogue.categories(
      request.tenant!,
      parseInput(catalogueListSchema, query),
    );
  }
  @RequirePermission("catalogue.read")
  @Get("categories/:categoryId")
  category(@Param("categoryId") id: string, @Req() request: RequestContext) {
    return this.catalogue.category(
      request.tenant!,
      assertUuid(id, "categoryId"),
    );
  }
  @RequirePermission("category.update")
  @Patch("categories/:categoryId")
  updateCategory(
    @Param("categoryId") id: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.catalogue.updateCategory(
      request.tenant!,
      request.user!.id,
      assertUuid(id, "categoryId"),
      parseInput(updateCategorySchema, body),
    );
  }

  @RequirePermission("brand.create")
  @Post("brands")
  createBrand(@Body() body: unknown, @Req() request: RequestContext) {
    return this.catalogue.createBrand(
      request.tenant!,
      request.user!.id,
      parseInput(createBrandSchema, body),
    );
  }
  @RequirePermission("catalogue.read")
  @Get("brands")
  brands(@Query() query: unknown, @Req() request: RequestContext) {
    return this.catalogue.brands(
      request.tenant!,
      parseInput(catalogueListSchema, query),
    );
  }
  @RequirePermission("brand.update")
  @Patch("brands/:brandId")
  updateBrand(
    @Param("brandId") id: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.catalogue.updateBrand(
      request.tenant!,
      request.user!.id,
      assertUuid(id, "brandId"),
      parseInput(updateBrandSchema, body),
    );
  }

  @RequirePermission("unit.create")
  @Post("units")
  createUnit(@Body() body: unknown, @Req() request: RequestContext) {
    return this.catalogue.createUnit(
      request.tenant!,
      request.user!.id,
      parseInput(createUnitSchema, body),
    );
  }
  @RequirePermission("catalogue.read")
  @Get("units")
  units(@Query() query: unknown, @Req() request: RequestContext) {
    return this.catalogue.units(
      request.tenant!,
      parseInput(catalogueListSchema, query),
    );
  }
  @RequirePermission("unit.update")
  @Patch("units/:unitId")
  updateUnit(
    @Param("unitId") id: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.catalogue.updateUnit(
      request.tenant!,
      request.user!.id,
      assertUuid(id, "unitId"),
      parseInput(updateUnitSchema, body),
    );
  }

  @ApiBody({
    schema: {
      example: {
        name: "Coca-Cola 330ml",
        type: "STOCK_ITEM",
        unitId: "uuid",
        categoryId: "uuid",
        brandId: "uuid",
        sku: "COKE330",
        barcode: "123456789",
        costMinor: 150,
        priceMinor: 300,
        trackInventory: true,
        minimumStock: "10.0000",
      },
    },
  })
  @RequirePermission("product.create")
  @Post("products")
  createProduct(@Body() body: unknown, @Req() request: RequestContext) {
    return this.catalogue.createProduct(
      request.tenant!,
      request.user!.id,
      parseInput(createProductSchema, body),
    );
  }
  @RequirePermission("catalogue.read")
  @Get("products")
  products(@Query() query: unknown, @Req() request: RequestContext) {
    return this.catalogue.products(
      request.tenant!,
      parseInput(productListSchema, query),
    );
  }

  @RequirePermission("catalogue.export")
  @Get("products/export")
  async exportProducts(@Req() request: RequestContext) {
    return this.catalogue.exportCsv(request.tenant!, request.user!.id);
  }

  @RequirePermission("catalogue.import")
  @Post("products/import")
  importProducts(@Body() body: unknown, @Req() request: RequestContext) {
    return this.catalogue.importCsv(
      request.tenant!,
      request.user!.id,
      parseInput(catalogueImportSchema, body),
    );
  }
  @RequirePermission("catalogue.read")
  @Get("products/:productId")
  product(@Param("productId") id: string, @Req() request: RequestContext) {
    return this.catalogue.product(request.tenant!, assertUuid(id, "productId"));
  }
  @RequirePermission("product.update")
  @Patch("products/:productId")
  updateProduct(
    @Param("productId") id: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.catalogue.updateProduct(
      request.tenant!,
      request.user!.id,
      assertUuid(id, "productId"),
      parseInput(updateProductSchema, body),
    );
  }

  @RequirePermission("product.create")
  @Post("products/:productId/variants")
  createVariant(
    @Param("productId") id: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.catalogue.createVariant(
      request.tenant!,
      request.user!.id,
      assertUuid(id, "productId"),
      parseInput(createVariantSchema, body),
    );
  }
  @RequirePermission("catalogue.read")
  @Get("products/:productId/variants")
  variants(@Param("productId") id: string, @Req() request: RequestContext) {
    return this.catalogue.variants(
      request.tenant!,
      assertUuid(id, "productId"),
    );
  }
  @RequirePermission("product.update")
  @Patch("products/:productId/variants/:variantId")
  updateVariant(
    @Param("productId") productId: string,
    @Param("variantId") variantId: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.catalogue.updateVariant(
      request.tenant!,
      request.user!.id,
      assertUuid(productId, "productId"),
      assertUuid(variantId, "variantId"),
      parseInput(updateVariantSchema, body),
    );
  }
}
