"use client";

import { useState, type FormEvent } from "react";
import { api, selectOrganization, type CurrentUser } from "../lib/api";

export default function ChangePasswordPage() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = String(data.get("newPassword") ?? "");
    if (next !== data.get("confirmPassword")) {
      setMessage("The new passwords do not match.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await api("/auth/change-temporary-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: data.get("currentPassword"),
          newPassword: next,
        }),
      });
      const user = await api<CurrentUser>("/auth/me");
      const membership = user.memberships.find(
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
      } else {
        window.location.assign("/onboarding");
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Password change failed.",
      );
      setBusy(false);
    }
  }
  return (
    <main className="auth-page auth-premium">
      <form className="card form" onSubmit={submit}>
        <span className="eyebrow">First sign-in security</span>
        <h1>Create your private password</h1>
        <p className="muted">
          Replace the temporary password from your activation email before
          opening the workspace.
        </p>
        <label>
          Temporary password
          <input
            name="currentPassword"
            type="password"
            minLength={8}
            required
            autoComplete="current-password"
          />
        </label>
        <label>
          New password
          <input
            name="newPassword"
            type="password"
            minLength={8}
            required
            autoComplete="new-password"
          />
        </label>
        <label>
          Confirm new password
          <input
            name="confirmPassword"
            type="password"
            minLength={8}
            required
            autoComplete="new-password"
          />
        </label>
        {message && <p className="error">{message}</p>}
        <button disabled={busy}>
          {busy ? "Securing account…" : "Save new password"}
        </button>
      </form>
    </main>
  );
}
