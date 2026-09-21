export interface PosProduct {
  productId: string;
  variantId: string | null;
  name: string;
  categoryName?: string | null;
  brandName?: string | null;
  variantName: string | null;
  sku: string | null;
  barcode: string | null;
  imageUrl?: string | null;
  type: "STOCK_ITEM" | "SERVICE" | "NON_STOCK_ITEM";
  priceMinor: number;
  costMinor?: number;
  trackInventory: boolean;
  allowNegativeStock: boolean;
  availableQuantity: string | null;
  unitSymbol: string;
  availableStaff?: Array<{
    id: string;
    displayName: string;
    priceMinor: number;
  }>;
}
export interface Payment {
  id: string;
  method: string;
  amountMinor: number;
  tenderedMinor: number | null;
  reference: string | null;
}
export interface SaleItem {
  id: string;
  productId: string;
  variantId: string | null;
  staffProfileId?: string | null;
  staffProfile?: { id: string; displayName: string } | null;
  productNameSnapshot: string;
  variantNameSnapshot: string | null;
  skuSnapshot: string | null;
  barcodeSnapshot: string | null;
  quantity: string;
  unitPriceMinor: number;
  grossMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  unitCostMinor?: number;
}
export interface Sale {
  id: string;
  invoiceNumber: string | null;
  status: string;
  paymentStatus: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  changeMinor: number;
  currency: string;
  customerName: string | null;
  customerPhone: string | null;
  customerId: string | null;
  balanceMinor: number;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
  items: SaleItem[];
  payments: Payment[];
  creator: { id: string; name: string };
  branch: {
    id: string;
    name: string;
    code: string;
    phone?: string | null;
    address?: string | null;
  };
  organization?: {
    id: string;
    name: string;
    arabicName: string | null;
    phone: string | null;
    currency: string;
  };
  refunds?: Array<{ id: string; kind: string; amountMinor: number; reason: string; createdAt: string }>;
}
export interface SaleSummary extends Omit<
  Sale,
  "items" | "creator" | "organization" | "payments"
> {
  creator: { id: string; name: string };
  payments: Array<Pick<Payment, "method" | "amountMinor">>;
  _count: { items: number };
}
export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
