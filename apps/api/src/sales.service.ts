import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, prisma } from "@allshops/database";
import type {
  AppointmentCheckoutInput,
  CheckoutInput,
  CompleteHeldSaleInput,
  DiscountInput,
  HoldSaleInput,
  PaymentInput,
  PosBarcodeLookupInput,
  PosProductListInput,
  SaleItemInput,
  SalesListInput,
} from "@allshops/contracts";
import { InventoryService } from "./inventory.service.js";
import { EntitlementService } from "./entitlement.service.js";
import type { TenantContext } from "./security.types.js";

type Transaction = Prisma.TransactionClient;
type ResolvedLine = {
  id: string;
  productId: string;
  variantId: string | null;
  productType: "STOCK_ITEM" | "NON_STOCK_ITEM" | "SERVICE";
  staffProfileId: string | null;
  productNameSnapshot: string;
  variantNameSnapshot: string | null;
  skuSnapshot: string | null;
  barcodeSnapshot: string | null;
  quantity: Prisma.Decimal;
  unitPriceMinor: number;
  unitCostMinor: number;
  grossMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  tracked: boolean;
};
type FinalizeOptions = {
  failAfterSale?: boolean;
  appointmentId?: string;
  priceOverrides?: Map<string, number>;
  allowNegativeStockOverride?: boolean;
  offline?: {
    transactionUuid: string;
    localReference: string;
    clientCreatedAt: Date;
    syncedAt: Date;
  };
};
export type SaleTotals = {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  discountType: "FIXED" | "PERCENTAGE" | null;
  discountValue: number | null;
};
type NormalizedPayment = PaymentInput & {
  appliedMinor: number;
  tenderedMinor: number | null;
};

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const jsonValue = <T>(value: T): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const moneyProduct = (minor: number, quantity: Prisma.Decimal) =>
  Number(new Prisma.Decimal(minor).mul(quantity).toFixed(0));
const hasPermission = (tenant: TenantContext, permission: string) =>
  tenant.permissions.includes(permission);

export function calculateSaleTotals(
  lines: Array<{ grossMinor: number }>,
  discount: DiscountInput | null,
): SaleTotals {
  const subtotalMinor = lines.reduce((sum, line) => sum + line.grossMinor, 0);
  if (subtotalMinor > 2_147_483_647)
    throw new BadRequestException({
      code: "SALE_TOTAL_TOO_LARGE",
      message: "Sale total is too large.",
    });
  let discountMinor = 0;
  if (discount?.type === "FIXED") discountMinor = discount.valueMinor;
  if (discount?.type === "PERCENTAGE") {
    discountMinor = Number(
      new Prisma.Decimal(subtotalMinor)
        .mul(discount.basisPoints)
        .div(10_000)
        .toFixed(0),
    );
  }
  if (discountMinor > subtotalMinor)
    throw new BadRequestException({
      code: "INVALID_DISCOUNT",
      message: "Discount cannot exceed subtotal.",
    });
  return {
    subtotalMinor,
    discountMinor,
    taxMinor: 0,
    totalMinor: subtotalMinor - discountMinor,
    discountType: discount?.type ?? null,
    discountValue:
      discount?.type === "FIXED"
        ? discount.valueMinor
        : (discount?.basisPoints ?? null),
  };
}

@Injectable()
export class SalesService {
  constructor(
    private readonly inventory: InventoryService,
    private readonly entitlements: EntitlementService,
  ) {}

  posBranches(tenant: TenantContext) {
    return prisma.branch.findMany({
      where: {
        organizationId: tenant.organizationId,
        isActive: true,
        ...(tenant.branchId ? { id: tenant.branchId } : {}),
      },
      select: { id: true, name: true, code: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }

  async posProducts(tenant: TenantContext, input: PosProductListInput) {
    return this.posProductsQuery(tenant, input);
  }

  async posProductByBarcode(
    tenant: TenantContext,
    input: PosBarcodeLookupInput,
  ) {
    this.assertBranchScope(tenant, input.branchId);
    const [product, variant] = await Promise.all([
      prisma.product.findFirst({
        where: {
          organizationId: tenant.organizationId,
          barcode: input.barcode,
          isActive: true,
        },
        select: { id: true },
      }),
      prisma.productVariant.findFirst({
        where: {
          organizationId: tenant.organizationId,
          barcode: input.barcode,
          isActive: true,
          product: { isActive: true },
        },
        select: { id: true, productId: true },
      }),
    ]);
    const productId = product?.id ?? variant?.productId;
    if (!productId) return null;
    const result = await this.posProductsQuery(
      tenant,
      { branchId: input.branchId, page: 1, pageSize: 1 },
      productId,
    );
    const variantId = variant?.id ?? null;
    return (
      result.items.find(
        (row) =>
          row["variantId"] === variantId && row["barcode"] === input.barcode,
      ) ?? null
    );
  }

  private async posProductsQuery(
    tenant: TenantContext,
    input: PosProductListInput,
    exactProductId?: string,
  ) {
    this.assertBranchScope(tenant, input.branchId);
    const location = await this.activeBranchLocation(
      prisma,
      tenant.organizationId,
      input.branchId,
    );
    const where: Prisma.ProductWhereInput = {
      organizationId: tenant.organizationId,
      isActive: true,
      ...(exactProductId
        ? { id: exactProductId }
        : input.search
          ? {
              OR: [
                { name: { contains: input.search, mode: "insensitive" } },
                { sku: { contains: input.search, mode: "insensitive" } },
                { barcode: { contains: input.search, mode: "insensitive" } },
                {
                  variants: {
                    some: {
                      isActive: true,
                      OR: [
                        {
                          name: { contains: input.search, mode: "insensitive" },
                        },
                        {
                          sku: { contains: input.search, mode: "insensitive" },
                        },
                        {
                          barcode: {
                            contains: input.search,
                            mode: "insensitive",
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
    };
    const [products, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        orderBy: { name: "asc" },
        include: {
          unit: { select: { symbol: true } },
          brand: { select: { name: true } },
          variants: { where: { isActive: true }, orderBy: { name: "asc" } },
          inventoryBalances: { where: { locationId: location.id } },
          staffServices: {
            where: {
              isActive: true,
              staffProfile: {
                isActive: true,
                isBookable: true,
                branches: {
                  some: { branchId: input.branchId, isActive: true },
                },
              },
            },
            include: {
              staffProfile: { select: { id: true, displayName: true } },
            },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);
    const mayReadCost = hasPermission(tenant, "product.cost.read");
    const items = products.flatMap((product) => {
      const rows: Array<Record<string, unknown>> = [
        {
          productId: product.id,
          variantId: null,
          name: product.name,
          brandName: product.brand?.name ?? null,
          variantName: null,
          sku: product.sku,
          barcode: product.barcode,
          imageUrl: product.imageUrl,
          type: product.type,
          priceMinor: product.priceMinor,
          ...(mayReadCost ? { costMinor: product.costMinor } : {}),
          trackInventory: product.trackInventory,
          allowNegativeStock: product.allowNegativeStock,
          availableQuantity: product.trackInventory
            ? (
                product.inventoryBalances.find(
                  (balance) => balance.variantId === null,
                )?.quantity ?? new Prisma.Decimal(0)
              ).toString()
            : null,
          unitSymbol: product.unit.symbol,
          availableStaff: product.staffServices.map((row) => ({
            id: row.staffProfile.id,
            displayName: row.staffProfile.displayName,
            priceMinor: row.customPriceMinor ?? product.priceMinor,
          })),
        },
      ];
      for (const variant of product.variants)
        rows.push({
          productId: product.id,
          variantId: variant.id,
          name: product.name,
          brandName: product.brand?.name ?? null,
          variantName: variant.name,
          sku: variant.sku ?? product.sku,
          barcode: variant.barcode ?? product.barcode,
          imageUrl: product.imageUrl,
          type: product.type,
          priceMinor: variant.priceMinor ?? product.priceMinor,
          ...(mayReadCost
            ? { costMinor: variant.costMinor ?? product.costMinor }
            : {}),
          trackInventory: product.trackInventory,
          allowNegativeStock: product.allowNegativeStock,
          availableQuantity: product.trackInventory
            ? (
                product.inventoryBalances.find(
                  (balance) => balance.variantId === variant.id,
                )?.quantity ?? new Prisma.Decimal(0)
              ).toString()
            : null,
          unitSymbol: product.unit.symbol,
          availableStaff: product.staffServices.map((row) => ({
            id: row.staffProfile.id,
            displayName: row.staffProfile.displayName,
            priceMinor:
              row.customPriceMinor ?? variant.priceMinor ?? product.priceMinor,
          })),
        });
      return rows;
    });
    return {
      items,
      page: input.page,
      pageSize: input.pageSize,
      total,
      locationId: location.id,
    };
  }

  checkout(
    tenant: TenantContext,
    userId: string,
    input: CheckoutInput,
    key: string,
    options?: FinalizeOptions,
  ) {
    this.assertDiscount(tenant, input.discount);
    return this.idempotent(
      tenant.organizationId,
      "sales.checkout",
      key,
      input,
      (tx) => this.finalize(tx, tenant, userId, input, undefined, options),
    );
  }

  quoteCardPayment(
    tenant: TenantContext,
    input: Omit<CheckoutInput, "payments">,
    options?: FinalizeOptions,
  ) {
    this.assertDiscount(tenant, input.discount);
    return prisma.$transaction(async (tx) => {
      this.assertBranchScope(tenant, input.branchId);
      await this.activeBranchLocation(
        tx,
        tenant.organizationId,
        input.branchId,
      );
      await this.assertDevice(
        tx,
        tenant.organizationId,
        input.branchId,
        input.deviceId,
      );
      const lines = await this.resolveLines(
        tx,
        tenant.organizationId,
        input.items,
        options?.priceOverrides,
      );
      await this.validateStaffAssignments(
        tx,
        tenant.organizationId,
        input.branchId,
        lines,
      );
      if (input.customerId) {
        const customer = await tx.customer.count({
          where: {
            id: input.customerId,
            organizationId: tenant.organizationId,
            isActive: true,
          },
        });
        if (!customer)
          throw new NotFoundException({
            code: "CUSTOMER_NOT_FOUND",
            message: "Active customer not found.",
          });
      }
      return {
        totals: this.calculate(lines, input.discount ?? null),
        priceSnapshots: lines.map((line) => ({
          key: `${line.productId}:${line.variantId ?? "BASE"}:${line.staffProfileId ?? "NONE"}`,
          unitPriceMinor: line.unitPriceMinor,
        })),
      };
    });
  }

  async quoteAppointmentCardPayment(
    tenant: TenantContext,
    appointmentId: string,
    input: Omit<AppointmentCheckoutInput, "payments">,
  ) {
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, organizationId: tenant.organizationId },
      include: { services: { orderBy: { sequence: "asc" } } },
    });
    if (!appointment)
      throw new NotFoundException({
        code: "APPOINTMENT_NOT_FOUND",
        message: "Appointment not found.",
      });
    this.assertBranchScope(tenant, appointment.branchId);
    if (appointment.status !== "COMPLETED" || appointment.saleId)
      throw new ConflictException({
        code: "APPOINTMENT_NOT_READY_FOR_CHECKOUT",
        message: "Only an unchecked completed appointment can be paid.",
      });
    const checkout: Omit<CheckoutInput, "payments"> = {
      branchId: appointment.branchId,
      customerId: appointment.customerId,
      customerName: appointment.customerNameSnapshot,
      customerPhone: appointment.customerPhoneSnapshot,
      notes: appointment.notes,
      deviceId: input.deviceId,
      discount: input.discount,
      items: [
        ...appointment.services.map((service) => ({
          productId: service.serviceProductId,
          staffProfileId: service.staffProfileId,
          quantity: "1",
        })),
        ...input.additionalItems,
      ],
    };
    const prices = new Map(
      appointment.services.map((service) => [
        `${service.serviceProductId}:${service.staffProfileId}`,
        service.priceMinorSnapshot,
      ]),
    );
    return {
      ...(await this.quoteCardPayment(tenant, checkout, {
        priceOverrides: prices,
      })),
      branchId: appointment.branchId,
    };
  }

  async quoteHeldCardPayment(
    tenant: TenantContext,
    saleId: string,
    input: Omit<CompleteHeldSaleInput, "payments">,
  ) {
    const held = await prisma.sale.findFirst({
      where: { id: saleId, organizationId: tenant.organizationId },
      include: { items: true },
    });
    if (!held)
      throw new NotFoundException({
        code: "SALE_NOT_FOUND",
        message: "Sale not found.",
      });
    this.assertBranchScope(tenant, held.branchId);
    if (!["HELD", "DRAFT"].includes(held.status))
      throw new ConflictException({
        code: "INVALID_SALE_TRANSITION",
        message: "Only a draft or held sale can be paid.",
      });
    const checkout: Omit<CheckoutInput, "payments"> = {
      branchId: held.branchId,
      items: held.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        staffProfileId: item.staffProfileId,
        quantity: item.quantity.toString(),
      })),
      discount: input.discount,
      customerId: held.customerId,
      customerName: held.customerName,
      customerPhone: held.customerPhone,
      notes: held.notes,
      deviceId: held.deviceId,
    };
    return {
      ...(await this.quoteCardPayment(tenant, checkout)),
      branchId: held.branchId,
    };
  }

  checkoutOffline(
    tenant: TenantContext,
    userId: string,
    input: CheckoutInput,
    transactionUuid: string,
    options: NonNullable<FinalizeOptions>,
  ) {
    this.assertDiscount(tenant, input.discount);
    return this.idempotent(
      tenant.organizationId,
      "offline.sales.sync",
      transactionUuid,
      input,
      (tx) => this.finalize(tx, tenant, userId, input, undefined, options),
    );
  }

  checkoutAppointment(
    tenant: TenantContext,
    userId: string,
    appointmentId: string,
    input: AppointmentCheckoutInput,
    key: string,
    options?: FinalizeOptions,
  ) {
    this.assertDiscount(tenant, input.discount);
    return this.idempotent(
      tenant.organizationId,
      `appointments.checkout:${appointmentId}`,
      key,
      input,
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`appointment-checkout:${appointmentId}`}))`;
        const appointment = await tx.appointment.findFirst({
          where: { id: appointmentId, organizationId: tenant.organizationId },
          include: { services: { orderBy: { sequence: "asc" } } },
        });
        if (!appointment)
          throw new NotFoundException({
            code: "APPOINTMENT_NOT_FOUND",
            message: "Appointment not found.",
          });
        this.assertBranchScope(tenant, appointment.branchId);
        if (appointment.status !== "COMPLETED")
          throw new ConflictException({
            code: "APPOINTMENT_NOT_COMPLETED",
            message: "Only a completed appointment can be checked out.",
          });
        if (appointment.saleId)
          throw new ConflictException({
            code: "APPOINTMENT_ALREADY_CHECKED_OUT",
            message: "This appointment has already been checked out.",
          });
        const checkout: CheckoutInput = {
          branchId: appointment.branchId,
          customerId: appointment.customerId,
          customerName: appointment.customerNameSnapshot,
          customerPhone: appointment.customerPhoneSnapshot,
          notes: appointment.notes,
          deviceId: input.deviceId,
          discount: input.discount,
          payments: input.payments,
          items: [
            ...appointment.services.map((service) => ({
              productId: service.serviceProductId,
              staffProfileId: service.staffProfileId,
              quantity: "1",
            })),
            ...input.additionalItems,
          ],
        };
        const prices = new Map(options?.priceOverrides);
        for (const service of appointment.services)
          prices.set(
            `${service.serviceProductId}:${service.staffProfileId}`,
            service.priceMinorSnapshot,
          );
        const result = await this.finalize(
          tx,
          tenant,
          userId,
          checkout,
          undefined,
          {
            appointmentId: appointment.id,
            priceOverrides: prices,
          },
        );
        await tx.appointment.update({
          where: { id: appointment.id },
          data: { saleId: result.id },
        });
        await tx.auditLog.create({
          data: {
            organizationId: tenant.organizationId,
            userId,
            action: "APPOINTMENT_CHECKED_OUT",
            entityType: "Appointment",
            entityId: appointment.id,
            afterJson: {
              saleId: result.id,
              invoiceNumber: result.invoiceNumber,
            },
          },
        });
        return result;
      },
    );
  }

  createHeld(tenant: TenantContext, userId: string, input: HoldSaleInput) {
    return this.serializable(async (tx) => {
      this.assertBranchScope(tenant, input.branchId);
      const location = await this.activeBranchLocation(
        tx,
        tenant.organizationId,
        input.branchId,
      );
      await this.assertDevice(
        tx,
        tenant.organizationId,
        input.branchId,
        input.deviceId,
      );
      const lines = await this.resolveLines(
        tx,
        tenant.organizationId,
        input.items,
      );
      const customer = input.customerId
        ? await tx.customer.findFirst({
            where: {
              id: input.customerId,
              organizationId: tenant.organizationId,
              isActive: true,
            },
          })
        : null;
      if (input.customerId && !customer)
        throw new NotFoundException({
          code: "CUSTOMER_NOT_FOUND",
          message: "Active customer not found.",
        });
      const totals = this.calculate(lines, null);
      const sale = await tx.sale.create({
        data: {
          organizationId: tenant.organizationId,
          branchId: input.branchId,
          locationId: location.id,
          status: "HELD",
          paymentStatus: "UNPAID",
          currency: "QAR",
          createdBy: userId,
          customerId: customer?.id,
          customerName: customer?.name ?? input.customerName,
          customerPhone: customer?.phone ?? input.customerPhone,
          notes: input.notes,
          deviceId: input.deviceId,
          ...totals,
        },
      });
      await this.replaceItems(tx, tenant.organizationId, sale.id, lines);
      await this.audit(
        tx,
        tenant.organizationId,
        userId,
        "SALE_HELD",
        sale.id,
        {
          branchId: sale.branchId,
          totalMinor: sale.totalMinor,
        },
      );
      return this.saleDetail(tx, tenant, sale.id);
    });
  }

  completeHeld(
    tenant: TenantContext,
    userId: string,
    saleId: string,
    input: CompleteHeldSaleInput,
    key: string,
    options?: FinalizeOptions,
  ) {
    this.assertDiscount(tenant, input.discount);
    return this.idempotent(
      tenant.organizationId,
      `sales.complete:${saleId}`,
      key,
      input,
      async (tx) => {
        const held = await tx.sale.findFirst({
          where: { id: saleId, organizationId: tenant.organizationId },
          include: { items: true },
        });
        if (!held)
          throw new NotFoundException({
            code: "SALE_NOT_FOUND",
            message: "Sale not found.",
          });
        this.assertBranchScope(tenant, held.branchId);
        if (held.status !== "HELD" && held.status !== "DRAFT") {
          throw new ConflictException({
            code: "INVALID_SALE_TRANSITION",
            message: "Only a draft or held sale can be completed.",
          });
        }
        const checkout: CheckoutInput = {
          branchId: held.branchId,
          items: held.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            staffProfileId: item.staffProfileId,
            quantity: item.quantity.toString(),
          })),
          discount: input.discount,
          payments: input.payments,
          customerId: held.customerId,
          customerName: held.customerName,
          customerPhone: held.customerPhone,
          notes: held.notes,
          deviceId: held.deviceId,
        };
        return this.finalize(tx, tenant, userId, checkout, held.id, options);
      },
    );
  }

  async cancel(tenant: TenantContext, userId: string, saleId: string) {
    return this.serializable(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, organizationId: tenant.organizationId },
      });
      if (!sale)
        throw new NotFoundException({
          code: "SALE_NOT_FOUND",
          message: "Sale not found.",
        });
      this.assertBranchScope(tenant, sale.branchId);
      const claimed = await tx.sale.updateMany({
        where: { id: sale.id, status: { in: ["DRAFT", "HELD"] } },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      if (claimed.count !== 1)
        throw new ConflictException({
          code: "INVALID_SALE_TRANSITION",
          message: "Completed or cancelled sales cannot be cancelled here.",
        });
      await this.audit(
        tx,
        tenant.organizationId,
        userId,
        "SALE_DRAFT_CANCELLED",
        sale.id,
        { branchId: sale.branchId },
      );
      return this.saleDetail(tx, tenant, sale.id);
    });
  }

  async held(tenant: TenantContext, input: SalesListInput) {
    return this.list(tenant, { ...input, status: "HELD" });
  }

  async list(tenant: TenantContext, input: SalesListInput) {
    this.assertBranchScope(tenant, input.branchId);
    const where: Prisma.SaleWhereInput = {
      organizationId: tenant.organizationId,
      ...(tenant.branchId
        ? { branchId: tenant.branchId }
        : input.branchId
          ? { branchId: input.branchId }
          : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.paymentMethod
        ? {
            payments: {
              some: { method: input.paymentMethod, status: "RECORDED" },
            },
          }
        : {}),
      ...(input.invoiceNumber
        ? {
            invoiceNumber: {
              contains: input.invoiceNumber,
              mode: "insensitive",
            },
          }
        : {}),
      ...(input.createdBy ? { createdBy: input.createdBy } : {}),
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...(input.paymentStatus ? { paymentStatus: input.paymentStatus } : {}),
      ...(input.dateFrom || input.dateTo
        ? {
            createdAt: {
              ...(input.dateFrom ? { gte: input.dateFrom } : {}),
              ...(input.dateTo ? { lte: input.dateTo } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.sale.findMany({
        where,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          branch: { select: { id: true, name: true, code: true } },
          creator: { select: { id: true, name: true } },
          payments: {
            where: { status: "RECORDED" },
            select: { method: true, amountMinor: true },
          },
          _count: { select: { items: true } },
        },
      }),
      prisma.sale.count({ where }),
    ]);
    return { items, page: input.page, pageSize: input.pageSize, total };
  }

  detail(tenant: TenantContext, saleId: string) {
    return this.saleDetail(prisma, tenant, saleId);
  }

  async receipt(
    tenant: TenantContext,
    userId: string,
    saleId: string,
    initialPrint = false,
  ) {
    const detail = await this.saleDetail(prisma, tenant, saleId);
    if (detail.status !== "COMPLETED")
      throw new ConflictException({
        code: "RECEIPT_NOT_AVAILABLE",
        message: "A receipt is available only for a completed sale.",
      });
    await prisma.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        userId,
        action: initialPrint ? "RECEIPT_PRINTED" : "RECEIPT_REPRINTED",
        entityType: "Sale",
        entityId: detail.id,
        afterJson: { invoiceNumber: detail.invoiceNumber },
      },
    });
    return detail;
  }

  private async finalize(
    tx: Transaction,
    tenant: TenantContext,
    userId: string,
    input: CheckoutInput,
    existingSaleId?: string,
    options?: FinalizeOptions,
  ) {
    this.assertBranchScope(tenant, input.branchId);
    const location = await this.activeBranchLocation(
      tx,
      tenant.organizationId,
      input.branchId,
    );
    await this.assertDevice(
      tx,
      tenant.organizationId,
      input.branchId,
      input.deviceId,
    );
    const lines = await this.resolveLines(
      tx,
      tenant.organizationId,
      input.items,
      options?.priceOverrides,
    );
    await this.validateStaffAssignments(
      tx,
      tenant.organizationId,
      input.branchId,
      lines,
    );
    const totals = this.calculate(lines, input.discount ?? null);
    if (input.customerId)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`customer:${input.customerId}`}))`;
    const customer = input.customerId
      ? await tx.customer.findFirst({
          where: {
            id: input.customerId,
            organizationId: tenant.organizationId,
            isActive: true,
          },
        })
      : null;
    if (input.customerId && !customer)
      throw new NotFoundException({
        code: "CUSTOMER_NOT_FOUND",
        message: "Active customer not found.",
      });
    const mayCredit = hasPermission(tenant, "sale.credit");
    const submittedMinor = input.payments.reduce(
      (sum, row) => sum + row.amountMinor,
      0,
    );
    if (submittedMinor < totals.totalMinor)
      await this.entitlements.assertFeature(
        tenant.organizationId,
        "customer_credit",
      );
    if (submittedMinor < totals.totalMinor && !customer)
      throw new ConflictException({
        code: "PAYMENT_UNDERPAID",
        message:
          "Payment does not cover the sale total; a customer is required for credit.",
      });
    if (submittedMinor < totals.totalMinor && !mayCredit)
      throw new ForbiddenException({
        code: "CREDIT_FORBIDDEN",
        message: "You do not have permission to create a credit sale.",
      });
    const payment = this.normalizePayments(
      input.payments,
      totals.totalMinor,
      mayCredit && customer !== null,
    );
    const balanceMinor = totals.totalMinor - payment.appliedMinor;
    if (
      customer?.creditLimitMinor !== null &&
      customer?.creditLimitMinor !== undefined &&
      customer.balanceMinor + balanceMinor > customer.creditLimitMinor
    )
      throw new ConflictException({
        code: "CREDIT_LIMIT_EXCEEDED",
        message: `Credit limit exceeded. Available credit is ${Math.max(0, customer.creditLimitMinor - customer.balanceMinor)} minor units.`,
      });
    const invoiceNumber = await this.nextInvoice(tx, tenant.organizationId);
    const now = options?.offline?.clientCreatedAt ?? new Date();
    const paymentStatus =
      balanceMinor === 0
        ? "PAID"
        : payment.appliedMinor === 0
          ? "UNPAID"
          : "PARTIALLY_PAID";
    const sale = existingSaleId
      ? await tx.sale.update({
          where: { id: existingSaleId },
          data: {
            invoiceNumber,
            status: "COMPLETED",
            paymentStatus,
            completedAt: now,
            locationId: location.id,
            paidMinor: payment.paidMinor,
            changeMinor: payment.changeMinor,
            balanceMinor,
            customerId: customer?.id,
            customerName: customer?.name ?? input.customerName,
            customerPhone: customer?.phone ?? input.customerPhone,
            ...totals,
          },
        })
      : await tx.sale.create({
          data: {
            organizationId: tenant.organizationId,
            branchId: input.branchId,
            locationId: location.id,
            invoiceNumber,
            status: "COMPLETED",
            paymentStatus,
            currency: "QAR",
            createdBy: userId,
            customerId: customer?.id,
            customerName: customer?.name ?? input.customerName,
            customerPhone: customer?.phone ?? input.customerPhone,
            notes: input.notes,
            deviceId: input.deviceId,
            source: options?.offline ? "OFFLINE_SYNC" : "ONLINE",
            transactionUuid: options?.offline?.transactionUuid,
            localReference: options?.offline?.localReference,
            clientCreatedAt: options?.offline?.clientCreatedAt,
            syncedAt: options?.offline?.syncedAt,
            completedAt: now,
            paidMinor: payment.paidMinor,
            changeMinor: payment.changeMinor,
            balanceMinor,
            ...totals,
          },
        });
    await this.replaceItems(tx, tenant.organizationId, sale.id, lines);
    if (options?.failAfterSale) throw new Error("PHASE3_TEST_ROLLBACK");
    for (const line of lines)
      if (line.tracked)
        await this.inventory.postSaleMovement(tx, tenant, {
          branchId: input.branchId,
          locationId: location.id,
          productId: line.productId,
          variantId: line.variantId,
          quantity: line.quantity,
          unitCostMinor: line.unitCostMinor,
          saleId: sale.id,
          saleItemId: line.id,
          userId,
          allowNegativeOverride: options?.allowNegativeStockOverride,
        });
    if (payment.rows.length > 0)
      await tx.payment.createMany({
        data: payment.rows.map((row) => ({
          organizationId: tenant.organizationId,
          saleId: sale.id,
          method: row.method,
          amountMinor: row.appliedMinor,
          tenderedMinor: row.tenderedMinor,
          reference: row.reference,
          recordedBy: userId,
        })),
      });
    for (const row of payment.rows)
      await this.audit(
        tx,
        tenant.organizationId,
        userId,
        "PAYMENT_RECORDED",
        sale.id,
        {
          method: row.method,
          amountMinor: row.appliedMinor,
        },
      );
    if (customer && balanceMinor > 0) {
      const resultingBalance = customer.balanceMinor + balanceMinor;
      await tx.customer.update({
        where: { id: customer.id },
        data: { balanceMinor: resultingBalance },
      });
      await tx.customerLedgerEntry.create({
        data: {
          organizationId: tenant.organizationId,
          customerId: customer.id,
          entryType: "CREDIT_SALE",
          referenceType: "SALE",
          referenceId: sale.id,
          debitMinor: balanceMinor,
          balanceAfterMinor: resultingBalance,
          description: `Credit sale ${invoiceNumber}`,
          occurredAt: now,
          createdBy: userId,
        },
      });
      await this.audit(
        tx,
        tenant.organizationId,
        userId,
        "CREDIT_SALE_CREATED",
        sale.id,
        {
          customerId: customer.id,
          balanceMinor,
          resultingBalanceMinor: resultingBalance,
        },
      );
    }
    if (totals.discountMinor > 0)
      await this.audit(
        tx,
        tenant.organizationId,
        userId,
        "DISCOUNT_APPLIED",
        sale.id,
        {
          discountType: totals.discountType,
          discountValue: totals.discountValue,
          discountMinor: totals.discountMinor,
        },
      );
    await this.createCommissions(
      tx,
      tenant.organizationId,
      input.branchId,
      userId,
      sale.id,
      lines,
      totals.discountMinor,
      options?.appointmentId,
    );
    await this.audit(
      tx,
      tenant.organizationId,
      userId,
      "SALE_COMPLETED",
      sale.id,
      {
        saleId: sale.id,
        invoiceNumber,
        organizationId: tenant.organizationId,
        branchId: input.branchId,
        userId,
        totalMinor: totals.totalMinor,
      },
    );
    return this.saleDetail(tx, tenant, sale.id);
  }

  private async resolveLines(
    tx: Transaction,
    organizationId: string,
    items: SaleItemInput[],
    priceOverrides?: Map<string, number>,
  ): Promise<ResolvedLine[]> {
    const seen = new Set<string>();
    for (const item of items) {
      const key = `${item.productId}:${item.variantId ?? "BASE"}:${item.staffProfileId ?? "NONE"}`;
      if (seen.has(key))
        throw new ConflictException({
          code: "DUPLICATE_SALE_ITEM",
          message: "Duplicate cart lines must be merged before checkout.",
        });
      seen.add(key);
    }
    const products = await tx.product.findMany({
      where: {
        organizationId,
        id: { in: [...new Set(items.map((item) => item.productId))] },
      },
      include: { variants: true, staffServices: true },
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    return items.map((item) => {
      const product = byId.get(item.productId);
      if (!product)
        throw new NotFoundException({
          code: "PRODUCT_NOT_FOUND",
          message: "Product not found in this organization.",
        });
      if (!product.isActive)
        throw new ConflictException({
          code: "PRODUCT_INACTIVE",
          message: `${product.name} is no longer active.`,
        });
      const variant = item.variantId
        ? product.variants.find((row) => row.id === item.variantId)
        : null;
      if (item.variantId && !variant)
        throw new NotFoundException({
          code: "VARIANT_NOT_FOUND",
          message: "The selected variant does not belong to this product.",
        });
      if (variant && !variant.isActive)
        throw new ConflictException({
          code: "VARIANT_INACTIVE",
          message: `${variant.name} is no longer active.`,
        });
      const quantity = new Prisma.Decimal(item.quantity);
      const overrideKey = `${product.id}:${item.variantId ?? "BASE"}:${item.staffProfileId ?? "NONE"}`;
      const legacyOverrideKey = `${product.id}:${item.staffProfileId ?? "NONE"}`;
      const staffPrice = item.staffProfileId
        ? product.staffServices.find(
            (row) => row.staffProfileId === item.staffProfileId && row.isActive,
          )?.customPriceMinor
        : null;
      const unitPriceMinor =
        priceOverrides?.get(overrideKey) ??
        priceOverrides?.get(legacyOverrideKey) ??
        staffPrice ??
        variant?.priceMinor ??
        product.priceMinor;
      const unitCostMinor = variant?.costMinor ?? product.costMinor;
      const grossMinor = moneyProduct(unitPriceMinor, quantity);
      return {
        id: randomUUID(),
        productId: product.id,
        variantId: variant?.id ?? null,
        productType: product.type,
        staffProfileId: item.staffProfileId ?? null,
        productNameSnapshot: product.name,
        variantNameSnapshot: variant?.name ?? null,
        skuSnapshot: variant?.sku ?? product.sku,
        barcodeSnapshot: variant?.barcode ?? product.barcode,
        quantity,
        unitPriceMinor,
        unitCostMinor,
        grossMinor,
        discountMinor: 0,
        taxMinor: 0,
        totalMinor: grossMinor,
        tracked: product.type === "STOCK_ITEM" && product.trackInventory,
      };
    });
  }

  private calculate(
    lines: ResolvedLine[],
    discount: DiscountInput | null,
  ): SaleTotals {
    return calculateSaleTotals(lines, discount);
  }

  private async validateStaffAssignments(
    tx: Transaction,
    organizationId: string,
    branchId: string,
    lines: ResolvedLine[],
  ) {
    for (const line of lines) {
      if (!line.staffProfileId) {
        if (line.productType === "SERVICE") {
          const now = new Date();
          const commissionable = await tx.commissionRule.count({
            where: {
              organizationId,
              serviceProductId: line.productId,
              isActive: true,
              AND: [
                {
                  OR: [
                    { effectiveFrom: null },
                    { effectiveFrom: { lte: now } },
                  ],
                },
                { OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
              ],
            },
          });
          if (commissionable > 0)
            throw new BadRequestException({
              code: "SERVICE_STAFF_REQUIRED",
              message: "Select capable staff for this commissionable service.",
            });
        }
        continue;
      }
      if (line.productType !== "SERVICE")
        throw new BadRequestException({
          code: "STAFF_ONLY_FOR_SERVICE",
          message: "Staff can only be assigned to service sale lines.",
        });
      const assignment = await tx.staffService.findFirst({
        where: {
          organizationId,
          staffProfileId: line.staffProfileId,
          serviceProductId: line.productId,
          isActive: true,
          staffProfile: {
            isActive: true,
            isBookable: true,
            branches: { some: { branchId, isActive: true } },
          },
        },
        select: { id: true },
      });
      if (!assignment)
        throw new NotFoundException({
          code: "STAFF_SERVICE_NOT_FOUND",
          message:
            "Active staff capability was not found for this branch and service.",
        });
    }
  }

  private allocateDiscount(lines: ResolvedLine[], discountMinor: number) {
    const allocations = new Map<string, number>();
    const subtotal = lines.reduce((sum, line) => sum + line.grossMinor, 0);
    let allocated = 0;
    lines.forEach((line, index) => {
      const amount =
        index === lines.length - 1
          ? discountMinor - allocated
          : subtotal === 0
            ? 0
            : Math.floor((discountMinor * line.grossMinor) / subtotal);
      allocations.set(line.id, amount);
      allocated += amount;
    });
    return allocations;
  }

  private async createCommissions(
    tx: Transaction,
    organizationId: string,
    branchId: string,
    userId: string,
    saleId: string,
    lines: ResolvedLine[],
    discountMinor: number,
    appointmentId?: string,
  ) {
    const allocations = this.allocateDiscount(lines, discountMinor);
    const earnedAt = new Date();
    for (const line of lines) {
      if (line.productType !== "SERVICE" || !line.staffProfileId) continue;
      const rules = await tx.commissionRule.findMany({
        where: {
          organizationId,
          staffProfileId: line.staffProfileId,
          isActive: true,
          OR: [
            { serviceProductId: line.productId },
            { serviceProductId: null },
          ],
          AND: [
            {
              OR: [
                { effectiveFrom: null },
                { effectiveFrom: { lte: earnedAt } },
              ],
            },
            { OR: [{ effectiveTo: null }, { effectiveTo: { gt: earnedAt } }] },
          ],
        },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      });
      const rule =
        rules.find((row) => row.serviceProductId === line.productId) ??
        rules.find((row) => row.serviceProductId === null);
      if (!rule) continue;
      const baseAmountMinor = line.grossMinor - (allocations.get(line.id) ?? 0);
      const commissionAmountMinor =
        rule.type === "PERCENTAGE"
          ? Number(
              new Prisma.Decimal(baseAmountMinor)
                .mul(rule.basisPoints!)
                .div(10_000)
                .toFixed(0),
            )
          : Math.min(rule.valueMinor!, baseAmountMinor);
      if (commissionAmountMinor <= 0) continue;
      const commission = await tx.commission.create({
        data: {
          organizationId,
          branchId,
          staffProfileId: line.staffProfileId,
          saleId,
          saleItemId: line.id,
          appointmentId,
          ruleId: rule.id,
          baseAmountMinor,
          commissionAmountMinor,
          earnedAt,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: "COMMISSION_EARNED",
          entityType: "Commission",
          entityId: commission.id,
          afterJson: {
            saleId,
            saleItemId: line.id,
            staffProfileId: line.staffProfileId,
            baseAmountMinor,
            commissionAmountMinor,
          },
        },
      });
    }
  }

  private normalizePayments(
    payments: PaymentInput[],
    totalMinor: number,
    allowCredit = false,
  ) {
    const paidMinor = payments.reduce(
      (sum, payment) => sum + payment.amountMinor,
      0,
    );
    if (paidMinor < totalMinor && !allowCredit)
      throw new ConflictException({
        code: "PAYMENT_UNDERPAID",
        message: "Payment amount does not cover the sale total.",
      });
    const nonCash = payments
      .filter((payment) => payment.method !== "CASH")
      .reduce((sum, payment) => sum + payment.amountMinor, 0);
    if (nonCash > totalMinor)
      throw new ConflictException({
        code: "PAYMENT_EXCEEDS_TOTAL",
        message: "Only cash tender may exceed the amount due.",
      });
    let changeMinor = Math.max(0, paidMinor - totalMinor);
    const rows: NormalizedPayment[] = payments.map((payment) => ({
      ...payment,
      appliedMinor: payment.amountMinor,
      tenderedMinor: payment.method === "CASH" ? payment.amountMinor : null,
    }));
    for (
      let index = rows.length - 1;
      index >= 0 && changeMinor > 0;
      index -= 1
    ) {
      const row = rows[index]!;
      if (row.method !== "CASH") continue;
      const deduction = Math.min(row.appliedMinor, changeMinor);
      row.appliedMinor -= deduction;
      changeMinor -= deduction;
    }
    if (changeMinor > 0)
      throw new ConflictException({
        code: "PAYMENT_EXCEEDS_TOTAL",
        message: "Excess payment must be cash tender returned as change.",
      });
    const applied = rows.reduce((sum, row) => sum + row.appliedMinor, 0);
    if (applied > totalMinor || (!allowCredit && applied !== totalMinor))
      throw new ConflictException({
        code: "PAYMENT_MISMATCH",
        message: "Applied payments must equal the sale total.",
      });
    return {
      rows,
      paidMinor,
      appliedMinor: applied,
      changeMinor: Math.max(0, paidMinor - totalMinor),
    };
  }

  private async replaceItems(
    tx: Transaction,
    organizationId: string,
    saleId: string,
    lines: ResolvedLine[],
  ) {
    await tx.saleItem.deleteMany({ where: { saleId } });
    await tx.saleItem.createMany({
      data: lines.map((line) => ({
        id: line.id,
        organizationId,
        saleId,
        productId: line.productId,
        variantId: line.variantId,
        staffProfileId: line.staffProfileId,
        productNameSnapshot: line.productNameSnapshot,
        variantNameSnapshot: line.variantNameSnapshot,
        skuSnapshot: line.skuSnapshot,
        barcodeSnapshot: line.barcodeSnapshot,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        unitCostMinor: line.unitCostMinor,
        grossMinor: line.grossMinor,
        discountMinor: line.discountMinor,
        taxMinor: line.taxMinor,
        totalMinor: line.totalMinor,
      })),
    });
  }

  private async activeBranchLocation(
    tx: Transaction | typeof prisma,
    organizationId: string,
    branchId: string,
  ) {
    const branch = await tx.branch.findFirst({
      where: { id: branchId, organizationId, isActive: true },
      select: { id: true },
    });
    if (!branch)
      throw new NotFoundException({
        code: "BRANCH_NOT_FOUND",
        message: "Active branch not found.",
      });
    const location = await tx.stockLocation.findFirst({
      where: { organizationId, branchId, isActive: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true, name: true },
    });
    if (!location)
      throw new NotFoundException({
        code: "STOCK_LOCATION_NOT_FOUND",
        message: "The branch has no active selling location.",
      });
    return location;
  }

  private async assertDevice(
    tx: Transaction,
    organizationId: string,
    branchId: string,
    deviceId?: string | null,
  ) {
    if (!deviceId) return;
    const device = await tx.device.findFirst({
      where: {
        id: deviceId,
        organizationId,
        status: "ACTIVE",
        OR: [{ branchId }, { branchId: null }],
      },
      select: { id: true },
    });
    if (!device) {
      throw new NotFoundException({
        code: "DEVICE_NOT_FOUND",
        message: "Active device not found for this branch.",
      });
    }
  }

  private async nextInvoice(tx: Transaction, organizationId: string) {
    const year = new Date().getUTCFullYear();
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:INV:${year}`}))`;
    const sequence = await tx.invoiceSequence.upsert({
      where: {
        organizationId_year_documentType: {
          organizationId,
          year,
          documentType: "INVOICE",
        },
      },
      create: {
        organizationId,
        year,
        documentType: "INVOICE",
        currentValue: 1,
      },
      update: { currentValue: { increment: 1 } },
    });
    return `INV-${year}-${String(sequence.currentValue).padStart(6, "0")}`;
  }

  private async saleDetail(
    tx: Transaction | typeof prisma,
    tenant: TenantContext,
    saleId: string,
  ) {
    const sale = await tx.sale.findFirst({
      where: {
        id: saleId,
        organizationId: tenant.organizationId,
        ...(tenant.branchId ? { branchId: tenant.branchId } : {}),
      },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            staffProfile: { select: { id: true, displayName: true } },
          },
        },
        payments: {
          where: { status: "RECORDED" },
          orderBy: { recordedAt: "asc" },
        },
        creator: { select: { id: true, name: true } },
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
            phone: true,
            address: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
            arabicName: true,
            phone: true,
            currency: true,
          },
        },
      },
    });
    if (!sale)
      throw new NotFoundException({
        code: "SALE_NOT_FOUND",
        message: "Sale not found.",
      });
    if (hasPermission(tenant, "product.cost.read")) return sale;
    return {
      ...sale,
      items: sale.items.map((item) => ({ ...item, unitCostMinor: undefined })),
    };
  }

  private assertDiscount(
    tenant: TenantContext,
    discount?: DiscountInput | null,
  ) {
    if (
      discount &&
      ((discount.type === "FIXED" && discount.valueMinor > 0) ||
        (discount.type === "PERCENTAGE" && discount.basisPoints > 0)) &&
      !hasPermission(tenant, "sale.discount")
    ) {
      throw new ForbiddenException({
        code: "DISCOUNT_FORBIDDEN",
        message: "You do not have permission to apply discounts.",
      });
    }
  }

  private assertBranchScope(tenant: TenantContext, branchId?: string) {
    if (tenant.branchId && branchId && tenant.branchId !== branchId)
      throw new ForbiddenException({
        code: "BRANCH_SCOPE_VIOLATION",
        message: "The selected branch is outside your membership scope.",
      });
  }

  private async idempotent<T>(
    organizationId: string,
    operation: string,
    key: string,
    payload: unknown,
    work: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    const requestHash = hash(payload);
    const existing = await prisma.idempotencyRecord.findUnique({
      where: {
        organizationId_operation_key: { organizationId, operation, key },
      },
    });
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new ConflictException({
          code: "IDEMPOTENCY_KEY_REUSED",
          message: "The idempotency key was used with a different request.",
        });
      if (existing.responseBody !== null) return existing.responseBody as T;
      throw new ConflictException({
        code: "REQUEST_IN_PROGRESS",
        message: "This checkout is still processing.",
      });
    }
    try {
      return await this.serializable(async (tx) => {
        const record = await tx.idempotencyRecord.create({
          data: {
            organizationId,
            operation,
            key,
            requestHash,
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        });
        const result = await work(tx);
        await tx.idempotencyRecord.update({
          where: { id: record.id },
          data: {
            responseCode: 201,
            responseBody: jsonValue(result),
          },
        });
        return result;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return this.idempotent(organizationId, operation, key, payload, work);
      }
      throw error;
    }
  }

  private async serializable<T>(
    work: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2034" ||
          attempt === 4
        )
          throw error;
      }
    }
    throw new ConflictException({
      code: "CONCURRENT_SALE_UPDATE",
      message: "Sale data changed concurrently; retry checkout.",
    });
  }

  private audit(
    tx: Transaction,
    organizationId: string,
    userId: string,
    action: string,
    saleId: string,
    afterJson: object,
  ) {
    return tx.auditLog.create({
      data: {
        organizationId,
        userId,
        action,
        entityType: "Sale",
        entityId: saleId,
        afterJson,
      },
    });
  }
}
