"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { api } from "../lib/api";

function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (data.get("password") !== data.get("confirmPassword")) {
      setMessage("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password: data.get("password") }),
      });
      setDone(true);
      setMessage(
        "Your password has been reset. Sign in on web or mobile with the new password.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Password reset failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page auth-premium">
      <form className="card form" onSubmit={submit}>
        <span className="eyebrow">Protected password reset</span>
        <h1>{done ? "Password updated" : "Choose a new password"}</h1>
        {!token && <p className="error">This reset link is incomplete.</p>}
        {!done && token && (
          <>
            <label>
              New password
              <input
                name="password"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </label>
            <label>
              Confirm password
              <input
                name="confirmPassword"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </label>
            <button disabled={busy}>
              {busy ? "Updating…" : "Reset password"}
            </button>
          </>
        )}
        {message && <p className={done ? "notice" : "error"}>{message}</p>}
        <p>
          <Link href="/login">Continue to sign in</Link>
        </p>
      </form>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
