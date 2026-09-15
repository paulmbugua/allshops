"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api } from "../lib/api";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ message: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: data.get("email") }),
      });
      setMessage(result.message);
    } catch {
      setMessage(
        "If that email belongs to an eligible account, a reset link has been sent.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page auth-premium">
      <form className="card form" onSubmit={submit}>
        <span className="eyebrow">Secure account recovery</span>
        <h1>Forgot your password?</h1>
        <p className="muted">
          Enter your account email. We will send a private one-hour reset link.
        </p>
        <label>
          Email address
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <button disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
        {message && <p className="notice">{message}</p>}
        <p>
          <Link href="/login">Return to sign in</Link>
        </p>
      </form>
    </main>
  );
}
