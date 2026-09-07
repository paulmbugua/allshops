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
  "OTHER"
]);

export const organizationStatusSchema = z.enum([
  "TRIAL",
  "ACTIVE",
  "SUSPENDED",
  "CANCELLED"
]);

export const createOrganizationSchema = z.object({
  name: z.string().min(2).max(120),
  legalName: z.string().max(160).optional(),
  arabicName: z.string().max(160).optional(),
  businessType: businessTypeSchema,
  registrationNumber: z.string().max(80).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(6).max(30).optional(),
  currency: z.literal("QAR").default("QAR"),
  timezone: z.literal("Asia/Qatar").default("Asia/Qatar")
});

export const createBranchSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(1).max(30).regex(/^[A-Z0-9_-]+$/),
  phone: z.string().min(6).max(30).optional(),
  email: z.string().email().optional(),
  address: z.string().max(300).optional(),
  timezone: z.literal("Asia/Qatar").default("Asia/Qatar")
});

export const loginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(8).max(128)
});

export const idempotencyKeySchema = z.string().uuid();

export type BusinessType = z.infer<typeof businessTypeSchema>;
export type OrganizationStatus = z.infer<typeof organizationStatusSchema>;
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
