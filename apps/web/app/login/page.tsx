"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  api,
  selectOrganization,
  setAccessToken,
  type AuthResult,
} from "../lib/api";
export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const organizationId = new URLSearchParams(window.location.search).get(
      "organization",
    );
    if (organizationId) selectOrganization(organizationId);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<AuthResult>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      setAccessToken(result.accessToken);
      const requested = new URLSearchParams(window.location.search).get(
        "organization",
      );
      const membership =
        result.user.memberships.find(
          (item) =>
            item.status === "ACTIVE" && item.organizationId === requested,
        ) ?? result.user.memberships.find((item) => item.status === "ACTIVE");
      if (membership) {
        selectOrganization(membership.organizationId);
        const cashierReady = [
          "catalogue.read",
          "sale.create",
          "payment.record",
        ].every((permission) => membership.permissions.includes(permission));
        window.location.assign(cashierReady ? "/pos" : "/dashboard");
      } else window.location.assign("/onboarding");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="auth-page">
      <form className="card form" onSubmit={submit}>
        <span className="eyebrow">Merchant access</span>
        <h1>Welcome back</h1>
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
            autoComplete="current-password"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <p>
          New to AllShops? <Link href="/register">Create an account</Link>
        </p>
      </form>
    </main>
  );
}
