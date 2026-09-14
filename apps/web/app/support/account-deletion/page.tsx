import type { Metadata } from "next";
import Link from "next/link";
import styles from "../../legal.module.css";

export const metadata: Metadata = { title: "Delete an account · AllShops" };

export default function AccountDeletionPage() {
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
        <h1>Delete an account</h1>
        <p>
          To request deletion of an AllShops user account, email{" "}
          <a href="mailto:admin@ekazi.co.ke?subject=AllShops%20account%20deletion%20request">
            admin@ekazi.co.ke
          </a>{" "}
          from the email address registered to the account. Include the
          organization name and write “AllShops account deletion request” in the
          subject.
        </p>
        <h2>What happens next</h2>
        <ol>
          <li>We verify the requester&apos;s identity and authority.</li>
          <li>We revoke the user&apos;s sessions and workspace access.</li>
          <li>
            We delete or de-identify eligible profile information and confirm
            completion.
          </li>
        </ol>
        <h2>Merchant workspace deletion</h2>
        <p>
          Only an authorized merchant owner can request deletion of an entire
          workspace. Financial transactions, invoices, security audits, backups,
          or records subject to an active dispute or legal retention requirement
          may be preserved for the required period. They remain
          access-controlled and are deleted or de-identified when that
          requirement ends.
        </p>
        <p>
          See the <Link href="/privacy">privacy policy</Link> for more
          information.
        </p>
      </article>
    </main>
  );
}
