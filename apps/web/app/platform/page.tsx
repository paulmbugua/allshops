"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import styles from "./platform.module.css";

type Overview = {
  workspaces: number;
  activeSubscriptions: number;
  expiredSubscriptions: number;
  openIssues: number;
};

export default function PlatformOverview() {
  const [data, setData] = useState<Overview>();
  const [message, setMessage] = useState("");
  useEffect(() => {
    void api<Overview>("/platform/overview")
      .then(setData)
      .catch((error: Error) => setMessage(error.message));
  }, []);
  return (
    <main className={styles.main}>
      <div>
        <h1>Platform overview</h1>
        <p>Manage merchant access and respond to support requests.</p>
      </div>
      {message && (
        <p role="alert" className="error">
          {message}
        </p>
      )}
      {!data && !message && <p role="status">Loading overview…</p>}
      {data && (
        <div className={styles.grid}>
          <Link
            href="/platform/subscriptions"
            className={"card " + styles.metric}
          >
            Workspaces<strong>{data.workspaces}</strong>
          </Link>
          <Link
            href="/platform/subscriptions?status=ACTIVE"
            className={"card " + styles.metric}
          >
            Active subscriptions<strong>{data.activeSubscriptions}</strong>
          </Link>
          <Link
            href="/platform/subscriptions?status=EXPIRED"
            className={"card " + styles.metric}
          >
            Expired subscriptions<strong>{data.expiredSubscriptions}</strong>
          </Link>
          <Link href="/platform/support" className={"card " + styles.metric}>
            Unresolved requests<strong>{data.openIssues}</strong>
          </Link>
        </div>
      )}
    </main>
  );
}
