import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = { title: "Privacy policy · AllShops" };

export default function PrivacyPage() {
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
        <h1>Privacy policy</h1>
        <p className={styles.updated}>Effective 10 September 2026</p>
        <p>
          AllShops provides point-of-sale and business-management services to
          merchants. This policy explains the information processed through our
          website, mobile application, and supporting services.
        </p>
        <h2>Information we process</h2>
        <ul>
          <li>
            Account and workplace information such as names, email addresses,
            roles, branches, and authentication records.
          </li>
          <li>
            Merchant business records such as products, stock, sales, local
            payment method labels, customers, suppliers, staff, appointments,
            expenses, and reports.
          </li>
          <li>
            Subscription billing records and Paystack transaction references.
            AllShops does not store full payment-card numbers.
          </li>
          <li>
            Device, synchronization, security, diagnostic, and audit information
            needed to operate and protect the service.
          </li>
        </ul>
        <h2>How information is used</h2>
        <p>
          We use information to provide the service, synchronize authorized
          devices, secure accounts, enforce merchant permissions and plan
          limits, process AllShops subscriptions, provide support, prevent
          misuse, and meet applicable contractual or legal obligations.
        </p>
        <h2>Sharing and processors</h2>
        <p>
          Information may be processed by infrastructure, security, monitoring,
          communication, and payment providers acting for AllShops. Paystack
          receives subscription-payment information when an authorized merchant
          starts a card payment. Merchant POS cash and local-terminal
          transactions remain merchant records and are separate from AllShops
          subscription billing.
        </p>
        <h2>Control, retention, and deletion</h2>
        <p>
          Merchant administrators control access to their workspace. Information
          is retained only as required to provide the service, preserve
          financial and security records, resolve disputes, and satisfy
          applicable obligations. Account holders can request access,
          correction, export, or deletion. Some transaction and audit records
          may need to be retained or de-identified instead of immediately
          erased.
        </p>
        <h2>Security and international processing</h2>
        <p>
          We use access controls, encrypted transport, restricted production
          networks, audit records, and backups. No system is completely
          risk-free. Service providers may process information in countries
          other than the user&apos;s location subject to appropriate contractual
          and technical safeguards.
        </p>
        <h2>Contact</h2>
        <p>
          For privacy questions or requests, email{" "}
          <a href="mailto:admin@ekazi.co.ke">admin@ekazi.co.ke</a>. For deletion
          instructions, visit{" "}
          <Link href="/support/account-deletion">Delete an account</Link>.
        </p>
      </article>
    </main>
  );
}
