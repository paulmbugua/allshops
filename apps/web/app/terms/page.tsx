import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = { title: "Terms of service · AllShops" };

export default function TermsPage() {
  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link className={styles.brand} href="/">
          ✦ AllShops
        </Link>
        <Link className={styles.back} href="/">
          Back home
        </Link>
      </nav>
      <article className={styles.content}>
        <h1>Terms of service</h1>
        <p className={styles.updated}>Effective 10 September 2026</p>
        <p>
          These terms govern access to AllShops. A merchant accepting them
          confirms that the person creating or administering the workspace is
          authorized to act for that merchant.
        </p>
        <h2>Service and merchant responsibility</h2>
        <p>
          AllShops supplies software for point of sale and business operations.
          Merchants remain responsible for their products, prices, taxes,
          receipts, employees, customer notices, local bank terminals, legal
          compliance, and the accuracy of information entered into the service.
        </p>
        <h2>Accounts and acceptable use</h2>
        <p>
          Users must protect credentials, grant only appropriate roles, promptly
          revoke former staff, and avoid unlawful activity, unauthorized access,
          malware, abusive automation, or interference with the platform.
          Activity performed through an account may be treated as authorized
          until compromise is reported.
        </p>
        <h2>Subscriptions and payments</h2>
        <p>
          Plan prices, billing periods, limits, trials, and renewal terms are
          displayed before selection. Paystack card checkout pays only for the
          AllShops platform subscription. Cash or local-card payments entered at
          merchant POS terminals belong to the merchant and are not collected or
          settled by AllShops.
        </p>
        <h2>Availability and offline operation</h2>
        <p>
          Offline features reduce disruption but do not eliminate operational
          risk. Merchants must reconcile queued sales, stock conflicts, devices,
          and reports after connectivity returns and follow the documented
          backup and incident procedures.
        </p>
        <h2>Suspension and termination</h2>
        <p>
          Access may be restricted for security threats, unlawful use,
          non-payment, plan violations, or material breach. A merchant can
          request closure subject to settlement, export, retention, and deletion
          requirements in the privacy policy and its commercial agreement.
        </p>
        <h2>Contact</h2>
        <p>
          Questions about these terms can be sent to{" "}
          <a href="mailto:admin@ekazi.co.ke">admin@ekazi.co.ke</a>.
        </p>
      </article>
    </main>
  );
}
