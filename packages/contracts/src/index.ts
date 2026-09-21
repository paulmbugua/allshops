import { z } from "zod";

export const businessTypeSchema = z.enum([
  "RETAIL",
  "GROCERY",
  "RESTAURANT_CAFE",
  "SALON",
  "BARBERSHOP",
  "GARAGE",
  "AUTO_SPARES",
  "LAUNDRY",
  "HARDWARE",
  "ELECTRONICS",
  "PRINTING",
  "GENERAL_SERVICES",
  "OTHER",
]);

export const organizationStatusSchema = z.enum([
  "TRIAL",
  "ACTIVE",
  "SUSPENDED",
  "CANCELLED",
]);

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  legalName: z.string().trim().max(160).optional(),
  arabicName: z.string().trim().max(160).optional(),
  businessType: businessTypeSchema,
  registrationNumber: z.string().trim().max(80).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().trim().min(6).max(30).optional(),
  currency: z.literal("QAR").default("QAR"),
  timezone: z.literal("Asia/Qatar").default("Asia/Qatar"),
});

export const updateOrganizationSchema = createOrganizationSchema
  .omit({ businessType: true, currency: true, timezone: true })
  .partial()
  .extend({
    businessType: businessTypeSchema.optional(),
    currency: z.literal("QAR").optional(),
    timezone: z.literal("Asia/Qatar").optional(),
    logoUrl: z.string().url().max(2048).nullable().optional(),
    welcomeHeadline: z.string().trim().max(120).nullable().optional(),
    tagline: z.string().trim().max(180).nullable().optional(),
    motto: z.string().trim().max(180).nullable().optional(),
    welcomeMessage: z.string().trim().max(600).nullable().optional(),
    brandPrimaryColor: z
      .string()
      .regex(/^#[0-9A-F]{6}$/i)
      .optional(),
    brandAccentColor: z
      .string()
      .regex(/^#[0-9A-F]{6}$/i)
      .optional(),
    idleTimeoutMinutes: z.number().int().min(1).max(120).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");

export const createBranchSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().min(6).max(30).optional(),
  email: z.string().email().optional(),
  address: z.string().max(300).optional(),
  timezone: z.literal("Asia/Qatar").default("Asia/Qatar"),
});

export const updateBranchSchema = createBranchSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
});

export const inviteUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2).max(120),
  roleId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(32).max(2048),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(2).max(120).optional(),
});

export const accountTokenSchema = z.object({
  token: z.string().min(32).max(2048),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const resetPasswordSchema = accountTokenSchema.extend({
  password: z.string().min(8).max(128),
});

export const updateMembershipSchema = z
  .object({
    roleId: z.string().uuid().optional(),
    branchId: z.string().uuid().nullable().optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");

export const idempotencyKeySchema = z.string().uuid();

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).optional();
const optionalNullableText = (maximum: number) =>
  z.string().trim().max(maximum).nullable().optional();
export const identifier = z.string().uuid();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const quantitySchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value))
  .pipe(
    z
      .string()
      .regex(
        /^\d{1,14}(\.\d{1,4})?$/,
        "Use a positive decimal with at most four decimal places.",
      ),
  );

export const signedQuantitySchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value))
  .pipe(
    z
      .string()
      .regex(
        /^-?\d{1,14}(\.\d{1,4})?$/,
        "Use a decimal with at most four decimal places.",
      ),
  );

export const productTypeSchema = z.enum([
  "STOCK_ITEM",
  "SERVICE",
  "NON_STOCK_ITEM",
]);
export const stockLocationTypeSchema = z.enum([
  "DEFAULT",
  "WAREHOUSE",
  "STORE",
  "OTHER",
]);
export const stockMovementTypeSchema = z.enum([
  "OPENING",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "SALE",
  "PURCHASE",
]);
export const transferStatusSchema = z.enum([
  "DRAFT",
  "SENT",
  "RECEIVED",
  "CANCELLED",
]);

export const createCategorySchema = z.object({
  parentId: identifier.nullable().optional(),
  name: z.string().trim().min(1).max(120),
  arabicName: optionalNullableText(160),
  description: optionalNullableText(500),
});
export const updateCategorySchema = createCategorySchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");

export const createBrandSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: optionalNullableText(500),
});
export const updateBrandSchema = createBrandSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");

export const createUnitSchema = z.object({
  name: z.string().trim().min(1).max(80),
  symbol: z.string().trim().min(1).max(20),
});
export const updateUnitSchema = createUnitSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");

const productFields = z.object({
  categoryId: identifier.nullable().optional(),
  brandId: identifier.nullable().optional(),
  unitId: identifier,
  name: z.string().trim().min(1).max(180),
  arabicName: optionalNullableText(180),
  description: optionalNullableText(2000),
  type: productTypeSchema,
  sku: z.string().trim().toUpperCase().min(1).max(80).nullable().optional(),
  barcode: z.string().trim().min(1).max(120).nullable().optional(),
  costMinor: z.number().int().min(0).max(2_147_483_647).default(0),
  priceMinor: z.number().int().min(0).max(2_147_483_647).default(0),
  trackInventory: z.boolean().optional(),
  allowNegativeStock: z.boolean().default(false),
  minimumStock: quantitySchema.nullable().optional(),
  imageUrl: z.string().url().max(2048).nullable().optional(),
  isActive: z.boolean().default(true),
});

export const createProductSchema = productFields.superRefine(
  (value, context) => {
    if (value.type !== "STOCK_ITEM" && value.trackInventory === true) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trackInventory"],
        message: "Only stock items can track inventory.",
      });
    }
    if (value.type !== "STOCK_ITEM" && value.allowNegativeStock) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allowNegativeStock"],
        message: "Only stock items can allow negative stock.",
      });
    }
    if (
      (value.trackInventory === false || value.type !== "STOCK_ITEM") &&
      value.minimumStock != null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minimumStock"],
        message: "Minimum stock requires inventory tracking.",
      });
    }
  },
);

export const updateProductSchema = productFields
  .partial()
  .refine((value) => Object.keys(value).length > 0, "No changes supplied")
  .superRefine((value, context) => {
    if (
      value.type &&
      value.type !== "STOCK_ITEM" &&
      value.trackInventory === true
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trackInventory"],
        message: "Only stock items can track inventory.",
      });
    }
  });

export const createVariantSchema = z.object({
  name: z.string().trim().min(1).max(180),
  attributes: z.record(z.string().trim().min(1).max(80)).optional(),
  sku: z.string().trim().toUpperCase().min(1).max(80).nullable().optional(),
  barcode: z.string().trim().min(1).max(120).nullable().optional(),
  costMinor: z.number().int().min(0).max(2_147_483_647).nullable().optional(),
  priceMinor: z.number().int().min(0).max(2_147_483_647).nullable().optional(),
  isActive: z.boolean().default(true),
});
export const updateVariantSchema = createVariantSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");

export const catalogueListSchema = paginationSchema.extend({
  search: optionalText(120),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
export const productListSchema = catalogueListSchema.extend({
  categoryId: identifier.optional(),
  brandId: identifier.optional(),
  type: productTypeSchema.optional(),
  trackInventory: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const inventoryFilterSchema = paginationSchema.extend({
  branchId: identifier.optional(),
  locationId: identifier.optional(),
  productId: identifier.optional(),
  variantId: identifier.optional(),
  lowStock: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
export const movementFilterSchema = inventoryFilterSchema
  .omit({ lowStock: true })
  .extend({
    movementType: stockMovementTypeSchema.optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
  });

export const openingStockSchema = z.object({
  branchId: identifier,
  locationId: identifier,
  productId: identifier,
  variantId: identifier.nullable().optional(),
  quantity: quantitySchema.refine(
    (value) => value !== "0" && !/^0(?:\.0+)?$/.test(value),
    "Quantity must be greater than zero.",
  ),
  unitCostMinor: z
    .number()
    .int()
    .min(0)
    .max(2_147_483_647)
    .nullable()
    .optional(),
  reason: optionalText(500),
});

export const adjustmentSchema = openingStockSchema
  .omit({ unitCostMinor: true })
  .extend({
    direction: z.enum(["IN", "OUT"]),
    unitCostMinor: z
      .number()
      .int()
      .min(0)
      .max(2_147_483_647)
      .nullable()
      .optional(),
    reason: z.string().trim().min(2).max(500),
  });

export const transferItemSchema = z.object({
  productId: identifier,
  variantId: identifier.nullable().optional(),
  quantity: quantitySchema.refine(
    (value) => value !== "0" && !/^0(?:\.0+)?$/.test(value),
    "Quantity must be greater than zero.",
  ),
  unitCostMinor: z
    .number()
    .int()
    .min(0)
    .max(2_147_483_647)
    .nullable()
    .optional(),
});
export const createTransferSchema = z
  .object({
    fromBranchId: identifier,
    fromLocationId: identifier,
    toBranchId: identifier,
    toLocationId: identifier,
    notes: optionalNullableText(1000),
    items: z.array(transferItemSchema).min(1).max(200),
  })
  .refine((value) => value.fromLocationId !== value.toLocationId, {
    path: ["toLocationId"],
    message: "Source and destination locations must differ.",
  });
export const transferListSchema = paginationSchema.extend({
  status: transferStatusSchema.optional(),
});

export const saleStatusSchema = z.enum([
  "DRAFT",
  "HELD",
  "COMPLETED",
  "CANCELLED",
]);
export const salePaymentStatusSchema = z.enum([
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
]);
export const paymentMethodSchema = z.enum([
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "QR",
  "OTHER",
]);
export const discountSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("FIXED"),
    valueMinor: z.number().int().min(0).max(2_147_483_647),
  }),
  z.object({
    type: z.literal("PERCENTAGE"),
    basisPoints: z.number().int().min(0).max(10_000),
  }),
]);
export const saleItemInputSchema = z.object({
  productId: identifier,
  variantId: identifier.nullable().optional(),
  staffProfileId: identifier.nullable().optional(),
  quantity: quantitySchema.refine(
    (value) => !/^0(?:\.0+)?$/.test(value),
    "Quantity must be greater than zero.",
  ),
});
export const paymentInputSchema = z.object({
  method: paymentMethodSchema,
  amountMinor: z.number().int().positive().max(2_147_483_647),
  reference: z.string().trim().min(1).max(120).nullable().optional(),
});
const saleSnapshotFields = {
  customerId: identifier.nullable().optional(),
  customerName: optionalNullableText(160),
  customerPhone: optionalNullableText(30),
  notes: optionalNullableText(1000),
  deviceId: identifier.nullable().optional(),
};
export const checkoutSchema = z.object({
  branchId: identifier,
  items: z.array(saleItemInputSchema).min(1).max(200),
  discount: discountSchema.nullable().optional(),
  payments: z.array(paymentInputSchema).max(10).default([]),
  ...saleSnapshotFields,
});
export const initializeCardPaymentSchema = checkoutSchema
  .omit({ payments: true })
  .strict();
export const paystackReferenceSchema = z
  .string()
  .min(8)
  .max(120)
  .regex(/^[A-Za-z0-9.=-]+$/);
export const holdSaleSchema = z.object({
  branchId: identifier,
  items: z.array(saleItemInputSchema).min(1).max(200),
  ...saleSnapshotFields,
});
export const completeHeldSaleSchema = z.object({
  discount: discountSchema.nullable().optional(),
  payments: z.array(paymentInputSchema).max(10).default([]),
});
export const refundSchema = z.object({
  kind: z.enum(["REFUND", "RETURN", "EXCHANGE"]).default("REFUND"),
  amountMinor: z.number().int().positive().max(2_147_483_647),
  method: paymentMethodSchema,
  reason: z.string().trim().min(2).max(500),
  reference: optionalNullableText(120),
  replacementSaleId: identifier.nullable().optional(),
  items: z.array(z.object({
    saleItemId: identifier,
    quantity: quantitySchema,
    amountMinor: z.number().int().positive().max(2_147_483_647),
  })).min(1).max(200),
});
export const openShiftSchema = z.object({
  branchId: identifier,
  openingCashMinor: z.number().int().min(0).max(2_147_483_647),
  deviceId: identifier.nullable().optional(),
  notes: optionalNullableText(500),
});
export const closeShiftSchema = z.object({
  countedCashMinor: z.number().int().min(0).max(2_147_483_647),
  notes: optionalNullableText(500),
});
export const cashMovementSchema = z.object({
  type: z.enum(["CASH_IN", "CASH_OUT"]),
  amountMinor: z.number().int().positive().max(2_147_483_647),
  reason: z.string().trim().min(2).max(300),
});
export const alertListSchema = paginationSchema.extend({
  status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]).optional(),
});
export const catalogueImportSchema = z.object({
  csv: z.string().min(1).max(5_000_000),
  dryRun: z.boolean().default(true),
});
export const salesListSchema = paginationSchema.extend({
  branchId: identifier.optional(),
  status: saleStatusSchema.optional(),
  paymentMethod: paymentMethodSchema.optional(),
  invoiceNumber: optionalText(80),
  createdBy: identifier.optional(),
  customerId: identifier.optional(),
  paymentStatus: salePaymentStatusSchema.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});
export const posProductListSchema = paginationSchema.extend({
  branchId: identifier,
  search: optionalText(120),
});
export const posBarcodeLookupSchema = z.object({
  branchId: identifier,
  barcode: z.string().trim().min(1).max(120),
});

export const supplierListSchema = paginationSchema.extend({
  search: optionalText(120),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
export const createSupplierSchema = z.object({
  name: z.string().trim().min(1).max(180),
  contactName: optionalNullableText(160),
  phone: optionalNullableText(30),
  email: z.string().trim().toLowerCase().email().nullable().optional(),
  address: optionalNullableText(500),
  taxNumber: optionalNullableText(100),
  notes: optionalNullableText(1000),
  isActive: z.boolean().default(true),
});
export const updateSupplierSchema = createSupplierSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");

export const purchaseStatusSchema = z.enum([
  "DRAFT",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CANCELLED",
]);
export const purchasePaymentStatusSchema = z.enum([
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
]);
export const purchaseItemInputSchema = z.object({
  productId: identifier,
  variantId: identifier.nullable().optional(),
  quantity: quantitySchema.refine(
    (value) => !/^0(?:\.0+)?$/.test(value),
    "Quantity must be greater than zero.",
  ),
  unitCostMinor: z.number().int().min(0).max(2_147_483_647),
  discountMinor: z.number().int().min(0).max(2_147_483_647).default(0),
  taxMinor: z.number().int().min(0).max(2_147_483_647).default(0),
});
export const createPurchaseSchema = z.object({
  branchId: identifier,
  supplierId: identifier,
  supplierInvoiceNumber: optionalNullableText(120),
  purchaseDate: z.coerce.date(),
  expectedDate: z.coerce.date().nullable().optional(),
  discountMinor: z.number().int().min(0).max(2_147_483_647).default(0),
  notes: optionalNullableText(1000),
  items: z.array(purchaseItemInputSchema).min(1).max(200),
});
export const updatePurchaseSchema = createPurchaseSchema
  .omit({ branchId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");
export const purchaseListSchema = paginationSchema.extend({
  supplierId: identifier.optional(),
  branchId: identifier.optional(),
  status: purchaseStatusSchema.optional(),
  paymentStatus: purchasePaymentStatusSchema.optional(),
  purchaseNumber: optionalText(80),
  supplierInvoiceNumber: optionalText(120),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});
export const receivePurchaseSchema = z.object({
  locationId: identifier,
  items: z
    .array(
      z.object({
        purchaseItemId: identifier,
        quantity: quantitySchema.refine(
          (value) => !/^0(?:\.0+)?$/.test(value),
          "Quantity must be greater than zero.",
        ),
      }),
    )
    .min(1)
    .max(200),
});
export const supplierPaymentSchema = z.object({
  purchaseId: identifier,
  amountMinor: z.number().int().positive().max(2_147_483_647),
  method: paymentMethodSchema,
  reference: optionalNullableText(120),
  paidAt: z.coerce.date().optional(),
  notes: optionalNullableText(1000),
});
export const supplierPaymentListSchema = paginationSchema.extend({
  purchaseId: identifier.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const customerListSchema = paginationSchema.extend({
  search: optionalText(120),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
export const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(180),
  phone: optionalNullableText(30),
  email: z.string().trim().toLowerCase().email().nullable().optional(),
  language: z.enum(["en", "ar"]).nullable().optional(),
  creditLimitMinor: z
    .number()
    .int()
    .min(0)
    .max(2_147_483_647)
    .nullable()
    .optional(),
  notes: optionalNullableText(1000),
  isActive: z.boolean().default(true),
});
export const updateCustomerSchema = createCustomerSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");
export const customerPaymentSchema = z.object({
  amountMinor: z.number().int().positive().max(2_147_483_647),
  method: paymentMethodSchema,
  reference: optionalNullableText(120),
  paidAt: z.coerce.date().optional(),
  notes: optionalNullableText(1000),
  saleId: identifier.nullable().optional(),
});
export const customerHistoryListSchema = paginationSchema.extend({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const createExpenseCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: optionalNullableText(500),
});
export const updateExpenseCategorySchema = createExpenseCategorySchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");
export const expenseCategoryListSchema = paginationSchema.extend({
  search: optionalText(120),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
export const createExpenseSchema = z.object({
  branchId: identifier,
  categoryId: identifier,
  amountMinor: z.number().int().positive().max(2_147_483_647),
  paymentMethod: paymentMethodSchema,
  expenseDate: z.coerce.date(),
  description: optionalNullableText(1000),
  reference: optionalNullableText(120),
  attachmentUrl: z.string().url().max(2048).nullable().optional(),
});
export const expenseListSchema = paginationSchema.extend({
  branchId: identifier.optional(),
  categoryId: identifier.optional(),
  paymentMethod: paymentMethodSchema.optional(),
  createdBy: identifier.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const serviceProfileSchema = z.object({
  durationMinutes: z.number().int().min(1).max(1_440),
  bufferBeforeMinutes: z.number().int().min(0).max(240).default(0),
  bufferAfterMinutes: z.number().int().min(0).max(240).default(0),
  appointmentEnabled: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export const staffListSchema = paginationSchema.extend({
  search: optionalText(120),
  branchId: identifier.optional(),
  serviceProductId: identifier.optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
export const createStaffSchema = z.object({
  userId: identifier.nullable().optional(),
  displayName: z.string().trim().min(1).max(160),
  phone: optionalNullableText(30),
  email: z.string().trim().toLowerCase().email().nullable().optional(),
  employeeNumber: z.string().trim().min(1).max(60).nullable().optional(),
  jobTitle: optionalNullableText(120),
  isBookable: z.boolean().default(true),
  isActive: z.boolean().default(true),
});
export const updateStaffSchema = createStaffSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");
export const staffServiceSchema = z.object({
  serviceProductId: identifier,
  customDurationMinutes: z
    .number()
    .int()
    .min(1)
    .max(1_440)
    .nullable()
    .optional(),
  customPriceMinor: z
    .number()
    .int()
    .min(0)
    .max(2_147_483_647)
    .nullable()
    .optional(),
  isActive: z.boolean().default(true),
});
export const updateStaffServiceSchema = staffServiceSchema
  .omit({ serviceProductId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");
export const staffBranchSchema = z.object({
  branchId: identifier,
  isPrimary: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
const timeOfDaySchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Time must use HH:mm");
export const staffAvailabilitySchema = z.object({
  ranges: z
    .array(
      z
        .object({
          branchId: identifier,
          dayOfWeek: z.number().int().min(0).max(6),
          startTime: timeOfDaySchema,
          endTime: timeOfDaySchema,
          isActive: z.boolean().default(true),
        })
        .refine(
          (row) => row.startTime < row.endTime,
          "Start time must be before end time",
        ),
    )
    .max(100),
});
export const staffTimeOffSchema = z
  .object({
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    reason: optionalNullableText(500),
  })
  .refine(
    (value) => value.endAt > value.startAt,
    "End time must be after start time",
  );
export const staffTimeOffListSchema = paginationSchema.extend({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const appointmentStatusSchema = z.enum([
  "BOOKED",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);
export const appointmentServiceInputSchema = z.object({
  serviceProductId: identifier,
  staffProfileId: identifier,
});
export const createAppointmentSchema = z
  .object({
    branchId: identifier,
    customerId: identifier.nullable().optional(),
    customerName: optionalNullableText(160),
    customerPhone: optionalNullableText(30),
    primaryStaffProfileId: identifier,
    startAt: z.coerce.date(),
    notes: optionalNullableText(1000),
    services: z.array(appointmentServiceInputSchema).min(1).max(20),
  })
  .refine(
    (value) => value.customerId || value.customerName || value.customerPhone,
    {
      message: "A customer or quick-booking name/phone is required.",
    },
  );
export const updateAppointmentSchema = z
  .object({
    branchId: identifier.optional(),
    customerId: identifier.nullable().optional(),
    customerName: optionalNullableText(160),
    customerPhone: optionalNullableText(30),
    primaryStaffProfileId: identifier.optional(),
    startAt: z.coerce.date().optional(),
    notes: optionalNullableText(1000),
    services: z.array(appointmentServiceInputSchema).min(1).max(20).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");
export const appointmentListSchema = paginationSchema.extend({
  branchId: identifier.optional(),
  staffProfileId: identifier.optional(),
  customerId: identifier.optional(),
  status: appointmentStatusSchema.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});
export const appointmentCancelSchema = z.object({
  cancellationReason: optionalNullableText(500),
});
export const appointmentCheckoutSchema = z.object({
  discount: discountSchema.nullable().optional(),
  payments: z.array(paymentInputSchema).max(10).default([]),
  additionalItems: z.array(saleItemInputSchema).max(200).default([]),
  deviceId: identifier.nullable().optional(),
});
export const initializeAppointmentCardPaymentSchema = appointmentCheckoutSchema
  .omit({ payments: true })
  .strict();
export const initializeHeldCardPaymentSchema = completeHeldSaleSchema
  .omit({ payments: true })
  .strict();
export const availabilityLookupSchema = z.object({
  branchId: identifier,
  serviceProductId: identifier,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  staffProfileId: identifier.optional(),
});

export const commissionRuleTypeSchema = z.enum(["PERCENTAGE", "FIXED"]);
const commissionRuleFieldsSchema = z.object({
  staffProfileId: identifier,
  serviceProductId: identifier.nullable().optional(),
  type: commissionRuleTypeSchema,
  basisPoints: z.number().int().min(0).max(10_000).nullable().optional(),
  valueMinor: z.number().int().min(0).max(2_147_483_647).nullable().optional(),
  priority: z.number().int().min(-1_000).max(1_000).default(0),
  effectiveFrom: z.coerce.date().nullable().optional(),
  effectiveTo: z.coerce.date().nullable().optional(),
  isActive: z.boolean().default(true),
});
export const createCommissionRuleSchema =
  commissionRuleFieldsSchema.superRefine((value, context) => {
    if (value.type === "PERCENTAGE" && value.basisPoints == null)
      context.addIssue({
        code: "custom",
        message: "basisPoints is required for percentage rules",
      });
    if (value.type === "FIXED" && value.valueMinor == null)
      context.addIssue({
        code: "custom",
        message: "valueMinor is required for fixed rules",
      });
    if (
      value.effectiveFrom &&
      value.effectiveTo &&
      value.effectiveTo <= value.effectiveFrom
    )
      context.addIssue({
        code: "custom",
        message: "effectiveTo must be after effectiveFrom",
      });
  });
export const updateCommissionRuleSchema = commissionRuleFieldsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");
export const commissionRuleListSchema = paginationSchema.extend({
  staffProfileId: identifier.optional(),
  serviceProductId: identifier.optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
export const commissionListSchema = paginationSchema.extend({
  staffProfileId: identifier.optional(),
  branchId: identifier.optional(),
  saleId: identifier.optional(),
  status: z.enum(["EARNED", "REVERSED"]).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

// Phase 6 reporting contracts. Dates are inclusive at the API boundary; the
// reporting service normalizes dateTo to an exclusive upper bound.
const qatarReportDateSchema = z.preprocess(
  (value) =>
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00+03:00`)
      : value,
  z.coerce.date(),
);
export const reportDateRangeSchema = z
  .object({
    branchId: identifier.optional(),
    dateFrom: qatarReportDateSchema.optional(),
    dateTo: qatarReportDateSchema.optional(),
  })
  .refine(
    (value) =>
      !value.dateFrom || !value.dateTo || value.dateTo >= value.dateFrom,
    "dateTo must be on or after dateFrom",
  );
export const salesReportFilterSchema = reportDateRangeSchema.and(
  z.object({
    cashierId: identifier.optional(),
    productId: identifier.optional(),
    categoryId: identifier.optional(),
    brandId: identifier.optional(),
    paymentMethod: paymentMethodSchema.optional(),
  }),
);
export const reconciliationDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  branchId: identifier.optional(),
});
export const submitReconciliationSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  branchId: identifier,
  countedCashMinor: z.number().int().min(0).max(2_147_483_647),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export const inventoryReportFilterSchema = z.object({
  branchId: identifier.optional(),
  productId: identifier.optional(),
  locationId: identifier.optional(),
  categoryId: identifier.optional(),
  brandId: identifier.optional(),
  lowStockOnly: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  outOfStockOnly: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  slowMovingDays: z.coerce.number().int().min(1).max(365).default(30),
});
export const movementReportFilterSchema = reportDateRangeSchema.and(
  z.object({
    productId: identifier.optional(),
    movementType: z
      .enum([
        "OPENING",
        "ADJUSTMENT_IN",
        "ADJUSTMENT_OUT",
        "TRANSFER_IN",
        "TRANSFER_OUT",
        "SALE",
        "PURCHASE",
      ])
      .optional(),
  }),
);
export const commissionReportFilterSchema = reportDateRangeSchema.and(
  z.object({ staffProfileId: identifier.optional() }),
);
export const reportExportSchema = z.object({
  format: z.literal("csv").default("csv"),
  branchId: identifier.optional(),
  dateFrom: qatarReportDateSchema.optional(),
  dateTo: qatarReportDateSchema.optional(),
});

export const registerDeviceSchema = z.object({
  branchId: identifier,
  name: z.string().trim().min(2).max(120),
  deviceIdentifier: identifier,
});
export const renameDeviceSchema = z.object({
  name: z.string().trim().min(2).max(120),
});
export const planCodeSchema = z.enum([
  "STARTER",
  "BUSINESS",
  "GROWTH",
  "ENTERPRISE",
  "LEGACY",
]);
export const subscriptionStatusSchema = z.enum([
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "GRACE_PERIOD",
  "SUSPENDED",
  "CANCELLED",
  "EXPIRED",
]);
export const billingIntervalSchema = z.enum(["MONTHLY", "ANNUAL", "CUSTOM"]);
export const billingStatusSchema = z.enum([
  "DUE",
  "PAID",
  "VOID",
  "FAILED",
  "WAIVED",
]);
export const selectPlanSchema = z
  .object({
    planCode: planCodeSchema.exclude(["LEGACY"]),
    billingInterval: billingIntervalSchema.exclude(["CUSTOM"]),
  })
  .strict();
export const platformSubscriptionListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: subscriptionStatusSchema.optional(),
  planCode: planCodeSchema.optional(),
  search: z.string().trim().max(120).optional(),
});
export const confirmSubscriptionPaymentSchema = z
  .object({
    billingRecordId: identifier,
    paymentMethod: z.enum(["BANK_TRANSFER", "CASH", "PAYSTACK", "OTHER"]),
    paymentReference: z.string().trim().min(1).max(160),
  })
  .strict();
export const extendTrialSchema = z
  .object({
    days: z.number().int().min(1).max(365),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export const subscriptionActionSchema = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();
export const platformChangePlanSchema = z
  .object({
    planCode: planCodeSchema,
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export const offlineSaleItemV1Schema = z.object({
  productId: identifier,
  variantId: identifier.nullable().optional(),
  staffProfileId: identifier.nullable().optional(),
  quantity: quantitySchema.refine(
    (value) => !/^0(?:\.0+)?$/.test(value),
    "Quantity must be greater than zero.",
  ),
  priceSnapshotMinor: z.number().int().min(0).max(2_147_483_647),
});
export const offlinePaymentV1Schema = z
  .object({
    method: paymentMethodSchema,
    amountMinor: z.number().int().positive().max(2_147_483_647),
    tenderedMinor: z.number().int().positive().max(2_147_483_647).optional(),
    reference: optionalNullableText(120),
  })
  .superRefine((value, context) => {
    if (value.method !== "CASH" && !value.reference)
      context.addIssue({
        code: "custom",
        path: ["reference"],
        message: "An external payment reference is required offline.",
      });
  });
export const offlineSalePayloadV1Schema = z.object({
  payloadVersion: z.literal(1),
  transactionUuid: identifier,
  deviceId: identifier,
  branchId: identifier,
  localReference: z.string().trim().min(1).max(80),
  sequenceNumber: z.number().int().positive(),
  clientCreatedAt: z.coerce.date(),
  catalogueSnapshotAt: z.coerce.date(),
  appVersion: z.string().trim().min(1).max(40),
  offlineSessionIssuedAt: z.coerce.date(),
  items: z.array(offlineSaleItemV1Schema).min(1).max(200),
  payments: z.array(offlinePaymentV1Schema).min(1).max(10),
  discount: discountSchema.nullable().optional(),
  customerName: optionalNullableText(160),
  customerPhone: optionalNullableText(30),
  notes: optionalNullableText(1000),
});
export const syncSalesBatchSchema = z.object({
  deviceId: identifier,
  transactions: z.array(offlineSalePayloadV1Schema).min(1).max(50),
});
export const conflictResolutionSchema = z.object({
  action: z.enum(["ACCEPT_OVERRIDE", "REJECT"]),
});
export const syncListSchema = paginationSchema.extend({
  deviceId: identifier.optional(),
  branchId: identifier.optional(),
  conflictCode: optionalText(80),
  status: z.enum(["PENDING", "SYNCED", "CONFLICT", "REJECTED"]).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export type BusinessType = z.infer<typeof businessTypeSchema>;
export type OrganizationStatus = z.infer<typeof organizationStatusSchema>;
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
export type AccountTokenInput = z.infer<typeof accountTokenSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;
export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateVariantInput = z.infer<typeof createVariantSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type CatalogueListInput = z.infer<typeof catalogueListSchema>;
export type ProductListInput = z.infer<typeof productListSchema>;
export type InventoryFilterInput = z.infer<typeof inventoryFilterSchema>;
export type MovementFilterInput = z.infer<typeof movementFilterSchema>;
export type OpeningStockInput = z.infer<typeof openingStockSchema>;
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;
export type TransferItemInput = z.infer<typeof transferItemSchema>;
export type CreateTransferInput = z.infer<typeof createTransferSchema>;
export type TransferListInput = z.infer<typeof transferListSchema>;
export type SaleStatus = z.infer<typeof saleStatusSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type DiscountInput = z.infer<typeof discountSchema>;
export type SaleItemInput = z.infer<typeof saleItemInputSchema>;
export type PaymentInput = z.infer<typeof paymentInputSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type RefundInput = z.infer<typeof refundSchema>;
export type OpenShiftInput = z.infer<typeof openShiftSchema>;
export type CloseShiftInput = z.infer<typeof closeShiftSchema>;
export type CashMovementInput = z.infer<typeof cashMovementSchema>;
export type AlertListInput = z.infer<typeof alertListSchema>;
export type CatalogueImportInput = z.infer<typeof catalogueImportSchema>;
export type InitializeCardPaymentInput = z.infer<
  typeof initializeCardPaymentSchema
>;
export type InitializeAppointmentCardPaymentInput = z.infer<
  typeof initializeAppointmentCardPaymentSchema
>;
export type InitializeHeldCardPaymentInput = z.infer<
  typeof initializeHeldCardPaymentSchema
>;
export type HoldSaleInput = z.infer<typeof holdSaleSchema>;
export type CompleteHeldSaleInput = z.infer<typeof completeHeldSaleSchema>;
export type SalesListInput = z.infer<typeof salesListSchema>;
export type PosProductListInput = z.infer<typeof posProductListSchema>;
export type PosBarcodeLookupInput = z.infer<typeof posBarcodeLookupSchema>;
export type SupplierListInput = z.infer<typeof supplierListSchema>;
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type PurchaseStatus = z.infer<typeof purchaseStatusSchema>;
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type UpdatePurchaseInput = z.infer<typeof updatePurchaseSchema>;
export type PurchaseListInput = z.infer<typeof purchaseListSchema>;
export type ReceivePurchaseInput = z.infer<typeof receivePurchaseSchema>;
export type SupplierPaymentInput = z.infer<typeof supplierPaymentSchema>;
export type SupplierPaymentListInput = z.infer<
  typeof supplierPaymentListSchema
>;
export type CustomerListInput = z.infer<typeof customerListSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CustomerPaymentInput = z.infer<typeof customerPaymentSchema>;
export type CustomerHistoryListInput = z.infer<
  typeof customerHistoryListSchema
>;
export type CreateExpenseCategoryInput = z.infer<
  typeof createExpenseCategorySchema
>;
export type UpdateExpenseCategoryInput = z.infer<
  typeof updateExpenseCategorySchema
>;
export type ExpenseCategoryListInput = z.infer<
  typeof expenseCategoryListSchema
>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type ExpenseListInput = z.infer<typeof expenseListSchema>;
export type ServiceProfileInput = z.infer<typeof serviceProfileSchema>;
export type StaffListInput = z.infer<typeof staffListSchema>;
export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
export type StaffServiceInput = z.infer<typeof staffServiceSchema>;
export type UpdateStaffServiceInput = z.infer<typeof updateStaffServiceSchema>;
export type StaffBranchInput = z.infer<typeof staffBranchSchema>;
export type StaffAvailabilityInput = z.infer<typeof staffAvailabilitySchema>;
export type StaffTimeOffInput = z.infer<typeof staffTimeOffSchema>;
export type StaffTimeOffListInput = z.infer<typeof staffTimeOffListSchema>;
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
export type AppointmentListInput = z.infer<typeof appointmentListSchema>;
export type AppointmentCancelInput = z.infer<typeof appointmentCancelSchema>;
export type AppointmentCheckoutInput = z.infer<
  typeof appointmentCheckoutSchema
>;
export type AvailabilityLookupInput = z.infer<typeof availabilityLookupSchema>;
export type CreateCommissionRuleInput = z.infer<
  typeof createCommissionRuleSchema
>;
export type UpdateCommissionRuleInput = z.infer<
  typeof updateCommissionRuleSchema
>;
export type CommissionRuleListInput = z.infer<typeof commissionRuleListSchema>;
export type CommissionListInput = z.infer<typeof commissionListSchema>;
export type ReportDateRangeInput = z.infer<typeof reportDateRangeSchema>;
export type SalesReportFilterInput = z.infer<typeof salesReportFilterSchema>;
export type ReconciliationDateInput = z.infer<typeof reconciliationDateSchema>;
export type SubmitReconciliationInput = z.infer<
  typeof submitReconciliationSchema
>;
export type InventoryReportFilterInput = z.infer<
  typeof inventoryReportFilterSchema
>;
export type MovementReportFilterInput = z.infer<
  typeof movementReportFilterSchema
>;
export type CommissionReportFilterInput = z.infer<
  typeof commissionReportFilterSchema
>;
export type ReportExportInput = z.infer<typeof reportExportSchema>;
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
export type RenameDeviceInput = z.infer<typeof renameDeviceSchema>;
export type SelectPlanInput = z.infer<typeof selectPlanSchema>;
export type PlatformSubscriptionListInput = z.infer<
  typeof platformSubscriptionListSchema
>;
export type ConfirmSubscriptionPaymentInput = z.infer<
  typeof confirmSubscriptionPaymentSchema
>;
export type ExtendTrialInput = z.infer<typeof extendTrialSchema>;
export type SubscriptionActionInput = z.infer<typeof subscriptionActionSchema>;
export type PlatformChangePlanInput = z.infer<typeof platformChangePlanSchema>;
export type OfflineSalePayloadV1 = z.infer<typeof offlineSalePayloadV1Schema>;
export type SyncSalesBatchInput = z.infer<typeof syncSalesBatchSchema>;
export type ConflictResolutionInput = z.infer<typeof conflictResolutionSchema>;
export type SyncListInput = z.infer<typeof syncListSchema>;

export function decimalCurrencyToMinor(value: string): number {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(
      "Currency must be a non-negative decimal with at most two places.",
    );
  }
  const [whole, fraction = ""] = normalized.split(".");
  const minor = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (minor > 2_147_483_647n) throw new Error("Currency amount is too large.");
  return Number(minor);
}

export function formatMinorCurrency(
  value: number,
  currency = "QAR",
  locale = "en-QA",
): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    value / 100,
  );
}
