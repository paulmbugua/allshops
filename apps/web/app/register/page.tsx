"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api, type AuthResult } from "../lib/api";
export default function RegisterPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(false);
  const [emailDelivery, setEmailDelivery] = useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (data.get("password") !== data.get("confirmPassword")) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await api<AuthResult>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      setEmailDelivery(result.emailDelivery);
      setCreated(true);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to register.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="auth-page">
      {created ? (
        <section className="card">
          <span className="eyebrow">Check your inbox</span>
          <h1>Activate your account</h1>
          <p className={emailDelivery === "SENT" ? "notice" : "error"}>
            {emailDelivery === "SENT"
              ? "Your account was created and a secure activation email was sent. Verify your address, then continue setup."
              : "Your account was created, but the activation email could not be delivered. Check the address and use Resend activation."}
          </p>
          {emailDelivery !== "SENT" && (
            <p>
              <Link href="/resend-activation">Resend activation email</Link>
            </p>
          )}
          <p className="muted">
            Business setup remains locked until you open the secure activation
            link sent to your email address.
          </p>
          <Link className="button-link" href="/login">
            I have activated my account
          </Link>
        </section>
      ) : (
        <form className="card form" onSubmit={submit}>
          <span className="eyebrow">Start your business workspace</span>
          <h1>Create account</h1>
          <label>
            Name
            <input name="name" required minLength={2} autoComplete="name" />
          </label>
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <label>
            Confirm password
            <input
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button disabled={loading}>
            {loading ? "Creating…" : "Create account"}
          </button>
          <p>
            Already registered? <Link href="/login">Sign in</Link>
          </p>
        </form>
      )}
    </main>
  );
}
