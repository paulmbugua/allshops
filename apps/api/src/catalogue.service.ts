import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, prisma } from "@allshops/database";
import type {
  CatalogueListInput,
  CatalogueImportInput,
  CreateBrandInput,
  CreateCategoryInput,
  CreateProductInput,
  CreateUnitInput,
  CreateVariantInput,
  ProductListInput,
  UpdateBrandInput,
  UpdateCategoryInput,
  UpdateProductInput,
  UpdateUnitInput,
  UpdateVariantInput,
} from "@allshops/contracts";
import { createProductSchema } from "@allshops/contracts";
import type { TenantContext } from "./security.types.js";
import { EntitlementService } from "./entitlement.service.js";

const normalize = (value: string) =>
  value.normalize("NFKC").trim().toLocaleLowerCase("en");
const page = (input: { page: number; pageSize: number }) => ({
  skip: (input.page - 1) * input.pageSize,
  take: input.pageSize,
});

@Injectable()
export class CatalogueService {
  constructor(private readonly entitlements: EntitlementService) {}

  async exportCsv(tenant: TenantContext, userId?: string) {
    const rows = await prisma.product.findMany({ where: { organizationId: tenant.organizationId }, include: { category: { select: { name: true } }, brand: { select: { name: true } }, unit: { select: { symbol: true } } }, orderBy: { name: "asc" } });
    const cell = (value: unknown) => {
      const text = String(value ?? "");
      const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const header = ["id", "name", "arabicName", "description", "type", "unitId", "categoryId", "brandId", "sku", "barcode", "costMinor", "priceMinor", "trackInventory", "allowNegativeStock", "minimumStock", "imageUrl", "category", "brand", "unitSymbol", "isActive"];
    if (userId) await prisma.auditLog.create({ data: { organizationId: tenant.organizationId, userId, action: "CATALOGUE_EXPORTED", entityType: "Product", afterJson: { count: rows.length, format: "csv" } } });
    return [header.join(","), ...rows.map((row) => [row.id, row.name, row.arabicName, row.description, row.type, row.unitId, row.categoryId, row.brandId, row.sku, row.barcode, row.costMinor, row.priceMinor, row.trackInventory, row.allowNegativeStock, row.minimumStock?.toString(), row.imageUrl, row.category?.name, row.brand?.name, row.unit.symbol, row.isActive].map(cell).join(","))].join("\n");
  }

  async importCsv(tenant: TenantContext, userId: string, input: CatalogueImportInput) {
    const lines = input.csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) return { dryRun: input.dryRun, imported: 0, errors: [{ row: 1, message: "CSV must contain a header and at least one row." }] };
    const parse = (line: string) => { const values: string[] = []; let value = ""; let quoted = false; for (let i = 0; i < line.length; i++) { const char = line[i]; if (char === '"' && line[i + 1] === '"') { value += '"'; i++; } else if (char === '"') quoted = !quoted; else if (char === "," && !quoted) { values.push(value); value = ""; } else value += char; } values.push(value); return values; };
    const headers = parse(lines[0]!).map((header) => header.trim());
    const errors: Array<{ row: number; message: string }> = [];
    const valid: CreateProductInput[] = [];
    for (let index = 1; index < lines.length; index++) {
      const values = parse(lines[index]!);
      const row = Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""]));
      try {
        valid.push(createProductSchema.parse({
          unitId: row.unitId,
          categoryId: row.categoryId || null,
          brandId: row.brandId || null,
          name: row.name,
          arabicName: row.arabicName || null,
          description: row.description || null,
          type: row.type || "STOCK_ITEM",
          sku: row.sku || null,
          barcode: row.barcode || null,
          costMinor: Number(row.costMinor || 0),
          priceMinor: Number(row.priceMinor || 0),
          trackInventory: row.trackInventory !== "false",
          allowNegativeStock: row.allowNegativeStock === "true",
          minimumStock: row.minimumStock || null,
          imageUrl: row.imageUrl || null,
          isActive: row.isActive !== "false",
        }));
      } catch (error) { errors.push({ row: index + 1, message: error instanceof Error ? error.message : "Invalid product row." }); }
    }
    let imported = 0;
    if (!input.dryRun && errors.length === 0) {
      for (const [offset, product] of valid.entries()) {
        try { await this.createProduct(tenant, userId, product); imported++; }
        catch (error) { errors.push({ row: offset + 2, message: error instanceof Error ? error.message : "Unable to create product." }); }
      }
    }
    if (!input.dryRun) await prisma.auditLog.create({ data: { organizationId: tenant.organizationId, userId, action: "CATALOGUE_IMPORTED", entityType: "Product", afterJson: { imported, validRows: valid.length, errors: errors.length } } });
    return { dryRun: input.dryRun, imported, validRows: valid.length, errors };
  }
  async categories(tenant: TenantContext, input: CatalogueListInput) {
    const where: Prisma.CategoryWhereInput = {
      organizationId: tenant.organizationId,
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      ...(input.search
        ? { name: { contains: input.search, mode: "insensitive" } }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.category.findMany({
        where,
        ...page(input),
        orderBy: [{ parentId: "asc" }, { name: "asc" }],
        include: {
          parent: { select: { id: true, name: true } },
          _count: { select: { children: true, products: true } },
        },
      }),
      prisma.category.count({ where }),
    ]);
    return { items, page: input.page, pageSize: input.pageSize, total };
  }

  async category(tenant: TenantContext, id: string) {
    const item = await prisma.category.findFirst({
      where: { id, organizationId: tenant.organizationId },
      include: {
        parent: { select: { id: true, name: true } },
        children: {
          where: { isActive: true },
          select: { id: true, name: true },
        },
      },
    });
    if (!item)
      throw new NotFoundException({
        code: "CATEGORY_NOT_FOUND",
        message: "Category not found.",
      });
    return item;
  }

  async createCategory(
    tenant: TenantContext,
    userId: string,
    input: CreateCategoryInput,
  ) {
    await this.assertCategoryParent(
      tenant.organizationId,
      input.parentId ?? null,
    );
    return prisma.$transaction(async (tx) => {
      const item = await tx.category.create({
        data: {
          organizationId: tenant.organizationId,
          parentId: input.parentId,
          parentKey: input.parentId ?? "ROOT",
          name: input.name,
          normalizedName: normalize(input.name),
          arabicName: input.arabicName,
          description: input.description,
        },
      });
      await this.audit(
        tx,
        tenant.organizationId,
        userId,
        "CATEGORY_CREATED",
        "Category",
        item.id,
        { name: item.name },
      );
      return item;
    });
  }

  async updateCategory(
    tenant: TenantContext,
    userId: string,
    id: string,
    input: UpdateCategoryInput,
  ) {
    const current = await this.category(tenant, id);
    const parentId =
      input.parentId === undefined ? current.parentId : input.parentId;
    if (parentId === id)
      throw new BadRequestException({
        code: "CATEGORY_CYCLE",
        message: "A category cannot be its own parent.",
      });
    await this.assertCategoryParent(tenant.organizationId, parentId);
    if (parentId)
      await this.assertNotDescendant(id, parentId, tenant.organizationId);
    return prisma.$transaction(async (tx) => {
      const item = await tx.category.update({
        where: { id },
        data: {
          ...(input.parentId !== undefined
            ? { parentId, parentKey: parentId ?? "ROOT" }
            : {}),
          ...(input.name !== undefined
            ? { name: input.name, normalizedName: normalize(input.name) }
            : {}),
          ...(input.arabicName !== undefined
            ? { arabicName: input.arabicName }
            : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await this.audit(
        tx,
        tenant.organizationId,
        userId,
        "CATEGORY_UPDATED",
        "Category",
        id,
        input,
      );
      return item;
    });
  }

  async brands(tenant: TenantContext, input: CatalogueListInput) {
    const where: Prisma.BrandWhereInput = {
      organizationId: tenant.organizationId,
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      ...(input.search
        ? { name: { contains: input.search, mode: "insensitive" } }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.brand.findMany({
        where,
        ...page(input),
        orderBy: { name: "asc" },
      }),
      prisma.brand.count({ where }),
    ]);
    return { items, page: input.page, pageSize: input.pageSize, total };
  }

  async createBrand(
    tenant: TenantContext,
    userId: string,
    input: CreateBrandInput,
  ) {
    return prisma.$transaction(async (tx) => {
      const item = await tx.brand.create({
        data: {
          organizationId: tenant.organizationId,
          name: input.name,
          normalizedName: normalize(input.name),
          description: input.description,
        },
      });
      await this.audit(
        tx,
        tenant.organizationId,
        userId,
        "BRAND_CREATED",
        "Brand",
        item.id,
        { name: item.name },
      );
      return item;
    });
  }

  async updateBrand(
    tenant: TenantContext,
    userId: string,
    id: string,
    input: UpdateBrandInput,
  ) {
    const current = await prisma.brand.findFirst({
      where: { id, organizationId: tenant.organizationId },
    });
    if (!current)
      throw new NotFoundException({
        code: "BRAND_NOT_FOUND",
        message: "Brand not found.",
      });
    return prisma.$transaction(async (tx) => {
      const item = await tx.brand.update({
        where: { id },
        data: {
          ...(input.name !== undefined
            ? { name: input.name, normalizedName: normalize(input.name) }
            : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await this.audit(
        tx,
        tenant.organizationId,
        userId,
        "BRAND_UPDATED",
        "Brand",
        id,
        input,
      );
      return item;
    });
  }

  async units(tenant: TenantContext, input: CatalogueListInput) {
    const where: Prisma.UnitWhereInput = {
      organizationId: tenant.organizationId,
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      ...(input.search
        ? {
            OR: [
              { name: { contains: input.search, mode: "insensitive" } },
              { symbol: { contains: input.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.unit.findMany({ where, ...page(input), orderBy: { name: "asc" } }),
      prisma.unit.count({ where }),
    ]);
    return { items, page: input.page, pageSize: input.pageSize, total };
  }

  async createUnit(
    tenant: TenantContext,
    userId: string,
    input: CreateUnitInput,
  ) {
    return prisma.$transaction(async (tx) => {
      const item = await tx.unit.create({
        data: {
          organizationId: tenant.organizationId,
          name: input.name,
          normalizedName: normalize(input.name),
          symbol: input.symbol,
        },
      });
      await this.audit(
        tx,
        tenant.organizationId,
        userId,
        "UNIT_CREATED",
        "Unit",
        item.id,
        { name: item.name, symbol: item.symbol },
      );
      return item;
    });
  }

  async updateUnit(
    tenant: TenantContext,
    userId: string,
    id: string,
    input: UpdateUnitInput,
  ) {
    const current = await prisma.unit.findFirst({
      where: { id, organizationId: tenant.organizationId },
    });
    if (!current)
      throw new NotFoundException({
        code: "UNIT_NOT_FOUND",
        message: "Unit not found.",
      });
    return prisma.$transaction(async (tx) => {
      const item = await tx.unit.update({
        where: { id },
        data: {
          ...(input.name !== undefined
            ? { name: input.name, normalizedName: normalize(input.name) }
            : {}),
          ...(input.symbol !== undefined ? { symbol: input.symbol } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await this.audit(
        tx,
        tenant.organizationId,
        userId,
        "UNIT_UPDATED",
        "Unit",
        id,
        input,
      );
      return item;
    });
  }

  async products(tenant: TenantContext, input: ProductListInput) {
    const where: Prisma.ProductWhereInput = {
      organizationId: tenant.organizationId,
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.brandId ? { brandId: input.brandId } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      ...(input.trackInventory === undefined
        ? {}
        : { trackInventory: input.trackInventory }),
      ...(input.search
        ? {
            OR: [
              { name: { contains: input.search, mode: "insensitive" } },
              { sku: { contains: input.search, mode: "insensitive" } },
              { barcode: { contains: input.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        ...page(input),
        orderBy: { createdAt: "desc" },
        include: {
          category: { select: { id: true, name: true } },
          brand: { select: { id: true, name: true } },
          unit: { select: { id: true, name: true, symbol: true } },
          variants: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              sku: true,
              barcode: true,
              priceMinor: true,
            },
          },
          inventoryBalances: {
            where: tenant.branchId ? { branchId: tenant.branchId } : {},
            select: { quantity: true },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);
    const mayReadCost = tenant.permissions.includes("product.cost.read");
    return {
      items: items.map((item) => {
        const { costMinor, inventoryBalances, ...visible } = item;
        return {
          ...visible,
          ...(mayReadCost ? { costMinor } : {}),
          stock: inventoryBalances
            .reduce(
              (sum, balance) => sum.add(balance.quantity),
              new Prisma.Decimal(0),
            )
            .toString(),
        };
      }),
      page: input.page,
      pageSize: input.pageSize,
      total,
    };
  }

  async product(tenant: TenantContext, id: string) {
    const item = await prisma.product.findFirst({
      where: { id, organizationId: tenant.organizationId },
      include: {
        category: true,
        brand: true,
        unit: true,
        variants: { orderBy: { createdAt: "asc" } },
        inventoryBalances: {
          where: tenant.branchId ? { branchId: tenant.branchId } : {},
          include: {
            branch: { select: { id: true, name: true } },
            location: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!item)
      throw new NotFoundException({
        code: "PRODUCT_NOT_FOUND",
        message: "Product not found.",
      });
    if (tenant.permissions.includes("product.cost.read")) return item;
    const { variants, ...visible } = item;
    return {
      ...visible,
      costMinor: undefined,
      variants: variants.map((variant) => ({
        ...variant,
        costMinor: undefined,
      })),
    };
  }

  async createProduct(
    tenant: TenantContext,
    userId: string,
    input: CreateProductInput,
  ) {
    await this.assertProductReferences(tenant.organizationId, input);
    await this.assertCodes(
      tenant.organizationId,
      input.sku ?? null,
      input.barcode ?? null,
    );
    const trackInventory = input.trackInventory ?? input.type === "STOCK_ITEM";
    return prisma.$transaction(async (tx) => {
      if (input.isActive !== false)
        await this.entitlements.assertWithinLimit(
          tx,
          tenant.organizationId,
          "products.max",
        );
      const item = await tx.product.create({
        data: {
          organizationId: tenant.organizationId,
          categoryId: input.categoryId,
          brandId: input.brandId,
          unitId: input.unitId,
          name: input.name,
          arabicName: input.arabicName,
          description: input.description,
          type: input.type,
          sku: input.sku,
          barcode: input.barcode,
          costMinor: input.costMinor,
          priceMinor: input.priceMinor,
          trackInventory,
          allowNegativeStock: input.allowNegativeStock,
          minimumStock: input.minimumStock,
          imageUrl: input.imageUrl,
          isActive: input.isActive,
          createdBy: userId,
        },
      });
      await this.audit(
        tx,
        tenant.organizationId,
        userId,
        "PRODUCT_CREATED",
        "Product",
        item.id,
        { name: item.name, sku: item.sku, type: item.type },
      );
      return item;
    });
  }

  async updateProduct(
    tenant: TenantContext,
    userId: string,
    id: string,
    input: UpdateProductInput,
  ) {
    const current = await this.product(tenant, id);
    await this.assertProductReferences(tenant.organizationId, input);
    await this.assertCodes(
      tenant.organizationId,
      input.sku ?? null,
      input.barcode ?? null,
      id,
    );
    const nextType = input.type ?? current.type;
    const nextTracking = input.trackInventory ?? current.trackInventory;
    const nextMinimumStock =
      input.minimumStock === undefined
        ? current.minimumStock
        : input.minimumStock;
    const nextAllowNegative =
      input.allowNegativeStock ?? current.allowNegativeStock;
    if (nextType !== "STOCK_ITEM" && nextTracking)
      throw new BadRequestException({
        code: "INVALID_PRODUCT_TRACKING",
        message: "Only stock items can track inventory.",
      });
    if (nextType !== "STOCK_ITEM" && nextAllowNegative)
      throw new BadRequestException({
        code: "INVALID_NEGATIVE_STOCK_POLICY",
        message: "Only stock items can allow negative stock.",
      });
    if (!nextTracking && nextMinimumStock !== null)
      throw new BadRequestException({
        code: "INVALID_MINIMUM_STOCK",
        message: "Minimum stock requires inventory tracking.",
      });
    if (
      !nextTracking &&
      (await prisma.stockMovement.count({
        where: { organizationId: tenant.organizationId, productId: id },
      })) > 0
    )
      throw new ConflictException({
        code: "INVENTORY_HISTORY_EXISTS",
        message:
          "Inventory tracking cannot be disabled after stock movements exist.",
      });
    return prisma.$transaction(async (tx) => {
      if (!current.isActive && input.isActive === true)
        await this.entitlements.assertWithinLimit(
          tx,
          tenant.organizationId,
          "products.max",
        );
      const item = await tx.product.update({
        where: { id },
        data: {
          ...(input.categoryId !== undefined
            ? { categoryId: input.categoryId }
            : {}),
          ...(input.brandId !== undefined ? { brandId: input.brandId } : {}),
          ...(input.unitId !== undefined ? { unitId: input.unitId } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.arabicName !== undefined
            ? { arabicName: input.arabicName }
            : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.sku !== undefined ? { sku: input.sku } : {}),
          ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
          ...(input.costMinor !== undefined
            ? { costMinor: input.costMinor }
            : {}),
          ...(input.priceMinor !== undefined
            ? { priceMinor: input.priceMinor }
            : {}),
          ...(input.trackInventory !== undefined
            ? { trackInventory: input.trackInventory }
            : {}),
          ...(input.allowNegativeStock !== undefined
            ? { allowNegativeStock: input.allowNegativeStock }
            : {}),
          ...(input.minimumStock !== undefined
            ? { minimumStock: input.minimumStock }
            : {}),
          ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await this.audit(
        tx,
        tenant.organizationId,
        userId,
        input.isActive === false ? "PRODUCT_DEACTIVATED" : "PRODUCT_UPDATED",
        "Product",
        id,
        input,
      );
      return item;
    });
  }

  async variants(tenant: TenantContext, productId: string) {
    await this.product(tenant, productId);
    const variants = await prisma.productVariant.findMany({
      where: { organizationId: tenant.organizationId, productId },
      orderBy: { createdAt: "asc" },
    });
    if (tenant.permissions.includes("product.cost.read")) return variants;
    return variants.map((variant) => ({ ...variant, costMinor: undefined }));
  }

  async createVariant(
    tenant: TenantContext,
    userId: string,
    productId: string,
    input: CreateVariantInput,
  ) {
    const product = await this.product(tenant, productId);
    if (!product.isActive)
      throw new ConflictException({
        code: "PRODUCT_INACTIVE",
        message: "Variants cannot be added to an inactive product.",
      });
    await this.assertCodes(
      tenant.organizationId,
      input.sku ?? null,
      input.barcode ?? null,
    );
    return prisma.$transaction(async (tx) => {
      const item = await tx.productVariant.create({
        data: {
          organizationId: tenant.organizationId,
          productId,
          name: input.name,
          attributes: input.attributes,
          sku: input.sku,
          barcode: input.barcode,
          costMinor: input.costMinor,
          priceMinor: input.priceMinor,
          isActive: input.isActive,
        },
      });
      await this.audit(
        tx,
        tenant.organizationId,
        userId,
        "PRODUCT_VARIANT_CREATED",
        "ProductVariant",
        item.id,
        { productId, name: item.name },
      );
      return item;
    });
  }

  async updateVariant(
    tenant: TenantContext,
    userId: string,
    productId: string,
    id: string,
    input: UpdateVariantInput,
  ) {
    const current = await prisma.productVariant.findFirst({
      where: { id, productId, organizationId: tenant.organizationId },
    });
    if (!current)
      throw new NotFoundException({
        code: "VARIANT_NOT_FOUND",
        message: "Product variant not found.",
      });
    await this.assertCodes(
      tenant.organizationId,
      input.sku ?? null,
      input.barcode ?? null,
      undefined,
      id,
    );
    return prisma.$transaction(async (tx) => {
      const item = await tx.productVariant.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.attributes !== undefined
            ? { attributes: input.attributes }
            : {}),
          ...(input.sku !== undefined ? { sku: input.sku } : {}),
          ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
          ...(input.costMinor !== undefined
            ? { costMinor: input.costMinor }
            : {}),
          ...(input.priceMinor !== undefined
            ? { priceMinor: input.priceMinor }
            : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await this.audit(
        tx,
        tenant.organizationId,
        userId,
        "PRODUCT_VARIANT_UPDATED",
        "ProductVariant",
        id,
        input,
      );
      return item;
    });
  }

  private async assertCategoryParent(
    organizationId: string,
    parentId: string | null,
  ) {
    if (!parentId) return;
    const parent = await prisma.category.findFirst({
      where: { id: parentId, organizationId },
    });
    if (!parent)
      throw new NotFoundException({
        code: "CATEGORY_NOT_FOUND",
        message: "Parent category not found.",
      });
  }

  private async assertNotDescendant(
    id: string,
    possibleParentId: string,
    organizationId: string,
  ) {
    let cursor: string | null = possibleParentId;
    while (cursor) {
      if (cursor === id)
        throw new BadRequestException({
          code: "CATEGORY_CYCLE",
          message: "Category hierarchy cannot contain a cycle.",
        });
      const node: { parentId: string | null } | null =
        await prisma.category.findFirst({
          where: { id: cursor, organizationId },
          select: { parentId: true },
        });
      cursor = node?.parentId ?? null;
    }
  }

  private async assertProductReferences(
    organizationId: string,
    input: {
      categoryId?: string | null;
      brandId?: string | null;
      unitId?: string;
    },
  ) {
    if (input.categoryId) {
      const item = await prisma.category.findFirst({
        where: { id: input.categoryId, organizationId, isActive: true },
      });
      if (!item)
        throw new NotFoundException({
          code: "CATEGORY_NOT_FOUND",
          message: "Category not found.",
        });
    }
    if (input.brandId) {
      const item = await prisma.brand.findFirst({
        where: { id: input.brandId, organizationId, isActive: true },
      });
      if (!item)
        throw new NotFoundException({
          code: "BRAND_NOT_FOUND",
          message: "Brand not found.",
        });
    }
    if (input.unitId) {
      const item = await prisma.unit.findFirst({
        where: { id: input.unitId, organizationId, isActive: true },
      });
      if (!item)
        throw new NotFoundException({
          code: "UNIT_NOT_FOUND",
          message: "Unit not found.",
        });
    }
  }

  private async assertCodes(
    organizationId: string,
    sku: string | null,
    barcode: string | null,
    productId?: string,
    variantId?: string,
  ) {
    if (!sku && !barcode) return;
    const codeWhere = {
      OR: [...(sku ? [{ sku }] : []), ...(barcode ? [{ barcode }] : [])],
    };
    const [product, variant] = await Promise.all([
      prisma.product.findFirst({
        where: {
          organizationId,
          ...(productId ? { id: { not: productId } } : {}),
          ...codeWhere,
        },
        select: { id: true },
      }),
      prisma.productVariant.findFirst({
        where: {
          organizationId,
          ...(variantId ? { id: { not: variantId } } : {}),
          ...codeWhere,
        },
        select: { id: true },
      }),
    ]);
    if (product || variant)
      throw new ConflictException({
        code: "DUPLICATE_PRODUCT_CODE",
        message: "SKU or barcode is already used in this organization.",
      });
  }

  private audit(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    afterJson: object,
  ) {
    return tx.auditLog.create({
      data: { organizationId, userId, action, entityType, entityId, afterJson },
    });
  }
}
