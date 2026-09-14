"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AppShell } from "../../components/app-shell";
import { api, selectedOrganization } from "../../lib/api";
import type { Supplier } from "../../lib/phase4";

export default function NewSupplierPage() {
  const organizationId = selectedOrganization();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const supplier = await api<Supplier>(
        `/organizations/${organizationId}/suppliers`,
        {
          method: "POST",
          body: JSON.stringify(
            Object.fromEntries(
              [
                "name",
                "contactName",
                "phone",
                "email",
                "address",
                "taxNumber",
                "notes",
              ].map((key) => [key, String(form.get(key) ?? "").trim() || null]),
            ),
          ),
        },
      );
      router.push(`/suppliers/${supplier.id}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create supplier.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppShell title="New supplier">
      <section className="card">
        <form className="form" onSubmit={submit}>
          <div className="form-grid">
            <label>
              Name
              <input name="name" required />
            </label>
            <label>
              Contact name
              <input name="contactName" />
            </label>
            <label>
              Phone
              <input name="phone" />
            </label>
            <label>
              Email
              <input name="email" type="email" />
            </label>
            <label>
              Tax number
              <input name="taxNumber" />
            </label>
            <label>
              Address
              <input name="address" />
            </label>
          </div>
          <label>
            Notes
            <textarea name="notes" />
          </label>
          {message && <p className="error">{message}</p>}
          <div className="actions">
            <button disabled={busy}>
              {busy ? "Saving…" : "Create supplier"}
            </button>
          </div>
        </form>
      </section>
    </AppShell>
  );
}
