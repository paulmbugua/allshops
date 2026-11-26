"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api, clearSession, setAccessToken, type AuthResult } from "../lib/api";
import styles from "./platform.module.css";

const navigation = [
  { href: "/platform", title: "Overview" },
  { href: "/platform/subscriptions", title: "Subscriptions" },
  { href: "/platform/support", title: "Support requests" },
];

export default function PlatformLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [access, setAccess] = useState<"checking" | "signed-out" | "ready">(
    "checking",
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem("allshops_access")) {
      setAccess("signed-out");
      return;
    }
    void api("/platform/overview")
      .then(() => setAccess("ready"))
      .catch((error: unknown) => {
        clearSession();
        setAccess("signed-out");
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to verify platform access.",
        );
      });
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const result = await api<AuthResult>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      setAccessToken(result.accessToken);
      await api("/platform/overview");
      setAccess("ready");
    } catch (error) {
      clearSession();
      setMessage(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Server session could not be closed.",
      );
    } finally {
      clearSession();
      setAccess("signed-out");
      setBusy(false);
    }
  }

  if (access === "checking")
    return (
      <main className={styles.gate}>
        <p role="status">Checking platform access…</p>
      </main>
    );
  if (access === "signed-out")
    return (
      <main className={styles.gate}>
        <form className="card form" onSubmit={signIn}>
          <span className="eyebrow">AllShops administration</span>
          <h1>Platform sign in</h1>
          <label>
            Work email
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {message && (
            <p className="error" role="alert">
              {message}
            </p>
          )}
          <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
      </main>
    );

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/platform" className={styles.wordmark}>
          AllShops <span>Admin</span>
        </Link>
        <nav aria-label="Platform administration">
          {navigation.map(({ href, title }) => (
            <Link
              key={href}
              href={href}
              aria-current={
                (
                  href === "/platform"
                    ? pathname === href
                    : pathname.startsWith(href)
                )
                  ? "page"
                  : undefined
              }
            >
              {title}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          disabled={busy}
          className="secondary"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      </header>
      {children}
    </div>
  );
}
