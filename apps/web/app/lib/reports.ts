import { API_URL } from "./api";

export interface ReportPeriod {
  from: string;
  toExclusive: string;
  timezone: string;
}
export interface SalesReport {
  period: ReportPeriod;
  completedSalesCount: number;
  grossSalesMinor: number;
  discountMinor: number;
  taxMinor: number;
  netSalesMinor: number;
  averageSaleMinor: number;
  itemsSoldQuantity: number;
}
export interface DashboardReport {
  period: ReportPeriod;
  sales?: SalesReport;
  grossProfit?: {
    grossProfitMinor: number;
    grossMarginPercent: number;
  };
  expenses?: { totalMinor: number };
  receivables?: { customerOutstandingMinor: number };
  payables?: { supplierOutstandingMinor: number };
  inventory?: { lowStockCount: number };
}

export async function downloadReport(
  organizationId: string,
  reportType: string,
  query = "",
) {
  const token = sessionStorage.getItem("allshops_access");
  const response = await fetch(
    `${API_URL}/organizations/${organizationId}/reports/${reportType}/export?format=csv${query ? `&${query}` : ""}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(error.message ?? "Unable to export report.");
  }
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download =
    response.headers
      .get("content-disposition")
      ?.match(/filename="([^"]+)"/)?.[1] ?? `${reportType}.csv`;
  link.click();
  URL.revokeObjectURL(href);
}
