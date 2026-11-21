"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "../lib/api";

function StaffActivation() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"working" | "done" | "failed">("working");
  const [message, setMessage] = useState(
    "Activating your assigned AllShops access…",
  );
  useEffect(() => {
    if (!token) {
      setState("failed");
      setMessage("This activation link is incomplete.");
      return;
    }
    void api<{ email: string }>("/auth/activate-invitation", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(() => {
        setState("done");
        setMessage(
          "Account activated. Sign in with the temporary password in your email.",
        );
      })
      .catch((error) => {
        setState("failed");
        setMessage(
          error instanceof Error ? error.message : "Activation failed.",
        );
      });
  }, [token]);
  return (
    <main className="auth-page auth-premium">
      <section className="card form">
        <span className="eyebrow">Team account activation</span>
        <h1>
          {state === "done"
            ? "Your access is active"
            : state === "failed"
              ? "Activation needs attention"
              : "Activating account"}
        </h1>
        <p className={state === "failed" ? "error" : "notice"}>{message}</p>
        {state === "done" && (
          <Link className="button-link" href="/login">
            Continue to sign in
          </Link>
        )}
      </section>
    </main>
  );
}

export default function StaffActivationPage() {
  return (
    <Suspense>
      <StaffActivation />
    </Suspense>
  );
}
