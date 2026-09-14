"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api, setAccessToken, type AuthResult } from "../lib/api";
export default function RegisterPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
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
      setAccessToken(result.accessToken);
      window.location.assign("/onboarding");
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
    </main>
  );
}
