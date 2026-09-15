import type { TenantContext } from "./security.types.js";

export interface SupportFaq {
  id: string;
  category: string;
  question: string;
  answer: string;
  platforms: Array<"WEB" | "MOBILE">;
}

type ScopedFaq = SupportFaq & { anyPermission?: string[]; roles?: string[] };

const faqs: ScopedFaq[] = [
  {
    id: "sign-in",
    category: "Getting started",
    question: "How do I sign in on web or mobile?",
    answer:
      "Use the work email and temporary password sent when your account was created. Change the temporary password after your first sign-in. Your available workspaces are controlled by your assigned role.",
    platforms: ["WEB", "MOBILE"],
  },
  {
    id: "employee-branch-id",
    category: "Getting started",
    question: "Where can I find my employee and branch IDs?",
    answer:
      "Your employee ID appears on the mobile home screen and in Settings > Users on web. Branch IDs are generated automatically from the branch name and appear in Settings > Branches.",
    platforms: ["WEB", "MOBILE"],
  },
  {
    id: "password-recovery",
    category: "Getting started",
    question: "How do I activate my account or reset a forgotten password?",
    answer:
      "New account owners receive a one-time activation email. If it expires, use Resend activation on the web sign-in screen. For a forgotten password, choose Forgot password on web or mobile; the secure one-hour link changes the password for both apps and signs out older sessions.",
    platforms: ["WEB", "MOBILE"],
  },
  {
    id: "pos-scan",
    category: "Point of sale",
    question: "How do I scan a product?",
    answer:
      "Open POS, select your selling branch, then scan with a connected scanner or the mobile camera. AllShops performs an exact indexed barcode lookup and adds the matching product immediately.",
    platforms: ["WEB", "MOBILE"],
    anyPermission: ["sale.create"],
  },
  {
    id: "cash-change",
    category: "Point of sale",
    question: "How is cash change calculated?",
    answer:
      "Choose Cash and enter the amount received. The change or remaining amount is shown before checkout. Confirm it with the customer, then complete the sale; configured web registers can print automatically.",
    platforms: ["WEB", "MOBILE"],
    anyPermission: ["payment.record"],
  },
  {
    id: "offline-sale",
    category: "Offline & sync",
    question: "Can I keep selling when the internet is down?",
    answer:
      "Yes, on an entitled and registered device. Complete the sale normally and keep the app installed. Paid unsynced sales are stored durably on the device and upload when connectivity returns.",
    platforms: ["WEB", "MOBILE"],
    anyPermission: ["sync.execute", "sale.create"],
  },
  {
    id: "sync-conflict",
    category: "Offline & sync",
    question: "What should I do with an offline synchronization conflict?",
    answer:
      "Do not repeat or re-charge the sale. A POS Supervisor or manager should open Sync conflicts, review the server result and local reference, then resolve it using the approved action.",
    platforms: ["WEB", "MOBILE"],
    anyPermission: ["sync.conflict.read", "sync.conflict.resolve"],
  },
  {
    id: "stock-adjustment",
    category: "Inventory",
    question: "How do I correct stock without making a sale?",
    answer:
      "Use Inventory adjustments and record the physical quantity plus a clear reason. Use Transfers when stock is moving between branches; never edit sale history to correct stock.",
    platforms: ["WEB", "MOBILE"],
    anyPermission: ["inventory.adjust", "inventory.transfer"],
  },
  {
    id: "product-image",
    category: "Catalogue",
    question: "How do I add a product photo?",
    answer:
      "Open Products, create or edit the item, and choose an image from the device. Use a clear square photo; it becomes the visual tile on the POS catalogue.",
    platforms: ["WEB", "MOBILE"],
    anyPermission: ["product.create", "product.update"],
  },
  {
    id: "credit-sale",
    category: "Customers & payments",
    question: "Why is a credit sale not shown as collected cash?",
    answer:
      "A credit sale increases the customer balance but is not collected money. It enters collected-payment reports only when an actual customer repayment is recorded.",
    platforms: ["WEB", "MOBILE"],
    anyPermission: [
      "sale.credit",
      "report.payments",
      "customer_payment.create",
    ],
  },
  {
    id: "reports-scope",
    category: "Reports",
    question: "Why can I only see one branch in reports?",
    answer:
      "Report queries enforce your membership branch scope. Organization-wide roles can change the branch filter; branch-scoped staff only receive data for their assigned branch.",
    platforms: ["WEB", "MOBILE"],
    anyPermission: ["report.dashboard", "report.sales"],
  },
  {
    id: "cashier-reconciliation",
    category: "Reports",
    question: "How does end-of-day cashier reconciliation work?",
    answer:
      "Each cashier opens End-of-day cash-up, confirms the business date, counts physical cash and submits. AllShops compares it with collected cash after change. Supervisors and branch managers review individual variances and approve the branch roll-up; organization managers and owners can view consolidated totals.",
    platforms: ["WEB", "MOBILE"],
    anyPermission: ["reconciliation.submit", "reconciliation.read_all"],
  },
  {
    id: "invite-staff",
    category: "Team & access",
    question: "How do I create a staff login?",
    answer:
      "In Settings > Users, enter the staff member's name and work email, then assign the least-privileged role and branch. AllShops generates the employee ID and emails a secure activation invitation.",
    platforms: ["WEB", "MOBILE"],
    anyPermission: ["user.invite", "role.assign"],
  },
  {
    id: "supervisor-reset",
    category: "Team & access",
    question: "Who can resolve an errored POS entry?",
    answer:
      "Cashiers cannot rewrite completed sales. POS Supervisors can handle held or errored operational entries and synchronization conflicts within their branch; sensitive corrections remain audited.",
    platforms: ["WEB", "MOBILE"],
    roles: ["POS_SUPERVISOR", "BRANCH_MANAGER", "MANAGER", "ADMIN", "OWNER"],
  },
  {
    id: "subscription",
    category: "Subscription & billing",
    question: "How do I activate or change the AllShops plan?",
    answer:
      "Open Subscription, compare the included services and limits, choose monthly or annual billing, then complete the secure Paystack card checkout. Merchant POS cash and local-card takings remain separate from AllShops billing.",
    platforms: ["WEB", "MOBILE"],
    anyPermission: ["billing.read", "billing.manage"],
  },
  {
    id: "suspended",
    category: "Subscription & billing",
    question: "What happens if a subscription is suspended?",
    answer:
      "Protected plan features stop accepting new operations after the applicable grace policy. Existing business records remain intact. An owner can settle the due bill and verify payment to restore entitlement.",
    platforms: ["WEB", "MOBILE"],
    anyPermission: ["billing.read", "billing.manage"],
  },
  {
    id: "diagnostic-help",
    category: "Troubleshooting",
    question: "What should I send support when something fails?",
    answer:
      "Send the time, screen, action, visible error, branch and device name. Include the request ID, invoice number or local sale reference when available. Never send passwords, card details or secret keys.",
    platforms: ["WEB", "MOBILE"],
  },
];

export function supportFaqsFor(tenant: TenantContext): SupportFaq[] {
  const permissions = new Set(tenant.permissions);
  return faqs
    .filter(
      (faq) =>
        (!faq.roles || faq.roles.includes(tenant.roleCode)) &&
        (!faq.anyPermission ||
          faq.anyPermission.some((permission) => permissions.has(permission))),
    )
    .map(({ id, category, question, answer, platforms }) => ({
      id,
      category,
      question,
      answer,
      platforms,
    }));
}
