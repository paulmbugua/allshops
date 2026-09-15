"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api, setAccessToken, type AuthResult } from "../lib/api";

function Activation() {
  const token = useSearchParams().get("token") ?? "";
  const [message, setMessage] = useState("Verifying your secure link…");
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!token) {
      setMessage("This activation link is incomplete.");
      return;
    }
    void api<AuthResult>("/auth/activate-account", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then((result) => {
        setAccessToken(result.accessToken);
        setDone(true);
        setMessage("Email verified. Your AllShops account is ready.");
      })
      .catch((error) =>
        setMessage(
          error instanceof Error ? error.message : "Activation failed.",
        ),
      );
  }, [token]);
  return (
    <main className="auth-page auth-premium">
      <section className="card">
        <span className="eyebrow">Account activation</span>
        <h1>{done ? "Welcome to AllShops" : "Confirming your email"}</h1>
        <p className={done ? "notice" : token ? "muted" : "error"}>{message}</p>
        {done && (
          <Link className="button-link" href="/onboarding">
            Set up my business
          </Link>
        )}
        {!done && (
          <p>
            <Link href="/resend-activation">
              Request a fresh activation email
            </Link>
            {" · "}
            <Link href="/login">Return to sign in</Link>
          </p>
        )}
      </section>
    </main>
  );
}

export default function ActivateAccountPage() {
  return (
    <Suspense>
      <Activation />
    </Suspense>
  );
}
