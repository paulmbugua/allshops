export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalMinor?: number;
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxNumber: string | null;
  notes: string | null;
  isActive: boolean;
  totalPurchasesMinor: number;
  outstandingMinor: number;
  purchases?: Purchase[];
  payments?: SupplierPayment[];
}

export interface PurchaseItem {
  id: string;
  productId: string;
  variantId: string | null;
  productNameSnapshot: string;
  variantNameSnapshot: string | null;
  quantity: string;
  receivedQuantity: string;
  unitCostMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export interface Purchase {
  id: string;
  purchaseNumber: string;
  supplierInvoiceNumber: string | null;
  purchaseDate: string;
  expectedDate: string | null;
  status: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  balanceMinor: number;
  notes: string | null;
  supplier: Pick<Supplier, "id" | "name">;
  branch: { id: string; name: string; code?: string };
  items?: PurchaseItem[];
  payments?: SupplierPayment[];
}

export interface SupplierPayment {
  id: string;
  purchaseId: string;
  amountMinor: number;
  method: string;
  reference: string | null;
  paidAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  language: string | null;
  creditLimitMinor?: number | null;
  balanceMinor?: number;
  totalPurchasesMinor: number;
  notes: string | null;
  isActive: boolean;
  sales?: Array<{
    id: string;
    invoiceNumber: string;
    totalMinor: number;
    balanceMinor: number;
    completedAt: string;
  }>;
  payments?: Array<{
    id: string;
    amountMinor: number;
    method: string;
    paidAt: string;
  }>;
  ledger?: Array<{
    id: string;
    entryType: string;
    debitMinor: number;
    creditMinor: number;
    balanceAfterMinor: number;
    occurredAt: string;
  }>;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface Expense {
  id: string;
  amountMinor: number;
  paymentMethod: string;
  expenseDate: string;
  description: string | null;
  reference: string | null;
  attachmentUrl: string | null;
  status: string;
  branch: { id: string; name: string };
  category: { id: string; name: string };
  creator: { id: string; name: string };
}

export interface Branch {
  id: string;
  name: string;
}
export interface Location {
  id: string;
  name: string;
  branchId: string;
}
export interface Product {
  id: string;
  name: string;
  costMinor?: number;
  variants?: Array<{ id: string; name: string; costMinor: number | null }>;
}

export const today = () => new Date().toISOString().slice(0, 10);
export const moneyInputToMinor = (value: string) =>
  Math.round(Number(value) * 100);
