"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  api,
  selectOrganization,
  setAccessToken,
  type AuthResult,
} from "../lib/api";
export default function AcceptInvitePage() {
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  useEffect(
    () =>
      setToken(new URLSearchParams(window.location.search).get("token") ?? ""),
    [],
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<AuthResult>("/auth/accept-invite", {
        method: "POST",
        body: JSON.stringify({
          token,
          name: data.get("name") || undefined,
          password: data.get("password"),
        }),
      });
      setAccessToken(result.accessToken);
      const membership = result.user.memberships.find(
        (item) => item.status === "ACTIVE",
      );
      if (membership) {
        selectOrganization(membership.organizationId);
        const cashierReady = [
          "catalogue.read",
          "sale.create",
          "payment.record",
        ].every((permission) => membership.permissions.includes(permission));
        window.location.assign(cashierReady ? "/pos" : "/dashboard");
      } else window.location.assign("/dashboard");
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Unable to accept invitation.",
      );
    }
  }
  return (
    <main className="auth-page">
      <form className="card form" onSubmit={submit}>
        <span className="eyebrow">Organization invitation</span>
        <h1>Activate your account</h1>
        <label>
          Invitation token
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            required
          />
        </label>
        <label>
          Name (optional)
          <input name="name" />
        </label>
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
        {message && <p className="error">{message}</p>}
        <button>Accept invitation</button>
      </form>
    </main>
  );
}
