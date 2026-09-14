export {
  decimalCurrencyToMinor,
  formatMinorCurrency,
} from "@allshops/contracts";

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
export interface Branch {
  id: string;
  name: string;
  code: string;
}
export interface Location {
  id: string;
  name: string;
  branchId: string;
  isDefault: boolean;
  branch: Branch;
}
export interface Category {
  id: string;
  name: string;
  arabicName?: string | null;
  parentId?: string | null;
  isActive: boolean;
  parent?: { id: string; name: string } | null;
}
export interface Brand {
  id: string;
  name: string;
  isActive: boolean;
}
export interface Unit {
  id: string;
  name: string;
  symbol: string;
  isActive: boolean;
}
export interface Product {
  id: string;
  name: string;
  arabicName?: string | null;
  description?: string | null;
  sku?: string | null;
  barcode?: string | null;
  type: "STOCK_ITEM" | "SERVICE" | "NON_STOCK_ITEM";
  costMinor?: number;
  priceMinor: number;
  trackInventory: boolean;
  allowNegativeStock: boolean;
  minimumStock?: string | null;
  imageUrl?: string | null;
  isActive: boolean;
  stock?: string;
  category?: Category | null;
  brand?: Brand | null;
  unit: Unit;
  variants?: Variant[];
  inventoryBalances?: InventoryRow[];
}
export interface Variant {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  costMinor?: number | null;
  priceMinor?: number | null;
  isActive: boolean;
}
export interface InventoryRow {
  id: string;
  quantity: string;
  lowStock: boolean;
  product: Pick<Product, "id" | "name" | "sku" | "minimumStock" | "isActive">;
  variant: Variant | null;
  branch: Pick<Branch, "id" | "name">;
  location: Pick<Location, "id" | "name">;
}
export const idempotencyKey = () => crypto.randomUUID();
