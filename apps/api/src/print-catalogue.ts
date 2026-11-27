import type { TenantContext } from "./security.types.js";

export const printCatalogue = [
  {
    id: "my-sales",
    title: "My sales",
    group: "Register",
    description: "Your completed transactions and payments.",
    permissions: ["sale.read"],
    personal: true,
  },
  {
    id: "my-shifts",
    title: "My register shifts",
    group: "Register",
    description: "Your opening float, counted cash and variances.",
    permissions: ["shift.read"],
    personal: true,
  },
  {
    id: "register-shifts",
    title: "Team register shifts",
    group: "Register",
    description: "Opening floats, cash counts and variances by cashier.",
    permissions: ["shift.read", "reconciliation.read_all"],
  },
  {
    id: "sales",
    title: "Sales register",
    group: "Sales",
    description: "Completed invoices by branch and cashier.",
    permissions: ["report.sales"],
  },
  {
    id: "sales-products",
    title: "Sales by product",
    group: "Sales",
    description: "Units sold and net sales by product.",
    permissions: ["report.sales"],
  },
  {
    id: "payments",
    title: "Payment summary",
    group: "Sales",
    description: "Collections by payment method after recorded refunds.",
    permissions: ["report.payments"],
  },
  {
    id: "refunds",
    title: "Refunds, returns and exchanges",
    group: "Sales",
    description: "Completed reversals by invoice, branch and tender.",
    permissions: ["report.sales", "sale.refund"],
  },
  {
    id: "purchases",
    title: "Purchases register",
    group: "Purchasing",
    description:
      "Received and partially received purchases and outstanding balances.",
    permissions: ["report.purchases"],
  },
  {
    id: "supplier-balances",
    title: "Supplier balances",
    group: "Purchasing",
    description: "Current outstanding supplier balances.",
    permissions: ["report.suppliers"],
    snapshot: true,
  },
  {
    id: "inventory",
    title: "Stock on hand",
    group: "Inventory",
    description: "Current quantities by product, branch and location.",
    permissions: ["report.inventory"],
    snapshot: true,
  },
  {
    id: "inventory-valuation",
    title: "Inventory valuation",
    group: "Inventory",
    description: "Current stock value and unit costs by location.",
    permissions: ["report.inventory", "report.inventory.valuation"],
    snapshot: true,
  },
  {
    id: "inventory-movements",
    title: "Stock movements",
    group: "Inventory",
    description: "Receipts, sales and adjustments by location.",
    permissions: ["report.inventory"],
  },
  {
    id: "expenses",
    title: "Expenses register",
    group: "Finance",
    description: "Recorded expenses grouped in a printable register.",
    permissions: ["report.expenses"],
  },
  {
    id: "profit",
    title: "Gross profit",
    group: "Finance",
    description: "Net revenue, historical cost and gross margin.",
    permissions: ["report.profit", "report.sales.cost"],
  },
  {
    id: "customer-balances",
    title: "Customer balances",
    group: "Finance",
    description: "Current receivables and credit limits.",
    permissions: ["report.customers", "report.customer_balances"],
    snapshot: true,
  },
  {
    id: "appointments",
    title: "Appointments summary",
    group: "Services",
    description: "Appointment counts by status within your access scope.",
    permissions: ["report.appointments"],
    feature: "appointments",
  },
  {
    id: "commissions",
    title: "Commissions",
    group: "Services",
    description: "Earned commissions within your staff access scope.",
    permissions: ["report.commissions"],
    feature: "commissions",
  },
] as const;

export type PrintReport = (typeof printCatalogue)[number];

export function canPrintReport(report: PrintReport, tenant: TenantContext) {
  return (
    report.permissions.every((permission) =>
      tenant.permissions.includes(permission),
    ) &&
    (("personal" in report && report.personal) ||
      tenant.permissions.includes("report.export"))
  );
}
