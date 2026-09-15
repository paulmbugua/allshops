"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api } from "../lib/api";

export default function ResendActivationPage() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ message: string }>("/auth/resend-activation", {
        method: "POST",
        body: JSON.stringify({ email: data.get("email") }),
      });
      setMessage(result.message);
    } catch {
      setMessage(
        "If verification is still required, a fresh activation email has been sent.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page auth-premium">
      <form className="card form" onSubmit={submit}>
        <span className="eyebrow">Email verification</span>
        <h1>Resend activation</h1>
        <p className="muted">
          Request a fresh one-time activation link for your new account.
        </p>
        <label>
          Email address
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <button disabled={busy}>
          {busy ? "Sending…" : "Send activation email"}
        </button>
        {message && <p className="notice">{message}</p>}
        <p>
          <Link href="/login">Return to sign in</Link>
        </p>
      </form>
    </main>
  );
}
