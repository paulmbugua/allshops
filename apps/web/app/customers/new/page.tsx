"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AppShell } from "../../components/app-shell";
import { api, selectedOrganization } from "../../lib/api";
import { moneyInputToMinor, type Customer } from "../../lib/phase4";

export default function NewCustomerPage() {
  const organizationId = selectedOrganization();
  const router = useRouter();
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const form = new FormData(event.currentTarget);
    try {
      const limit = String(form.get("limit") ?? "");
      const customer = await api<Customer>(
        `/organizations/${organizationId}/customers`,
        {
          method: "POST",
          body: JSON.stringify({
            name: form.get("name"),
            phone: String(form.get("phone") ?? "") || null,
            email: String(form.get("email") ?? "") || null,
            language: form.get("language") || null,
            creditLimitMinor: limit ? moneyInputToMinor(limit) : null,
            notes: String(form.get("notes") ?? "") || null,
          }),
        },
      );
      router.push(`/customers/${customer.id}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create customer.",
      );
    }
  }
  return (
    <AppShell title="New customer">
      <section className="card">
        <form className="form" onSubmit={submit}>
          <div className="form-grid">
            <label>
              Name
              <input name="name" required />
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
              Language
              <select name="language">
                <option value="">Not set</option>
                <option value="en">English</option>
                <option value="ar">Arabic</option>
              </select>
            </label>
            <label>
              Credit limit QAR
              <input name="limit" type="number" min="0" step="0.01" />
            </label>
          </div>
          <label>
            Notes
            <textarea name="notes" />
          </label>
          {message && <p className="error">{message}</p>}
          <button>Create customer</button>
        </form>
      </section>
    </AppShell>
  );
}
