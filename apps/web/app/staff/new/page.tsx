"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AppShell } from "../../components/app-shell";
import { api, selectedOrganization } from "../../lib/api";
import type { Staff } from "../../lib/phase5";

export default function NewStaffPage() {
  const router = useRouter();
  const organizationId = selectedOrganization();
  const [form, setForm] = useState({
    displayName: "",
    jobTitle: "",
    phone: "",
    email: "",
  });
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!organizationId) return;
    try {
      const row = await api<Staff>(`/organizations/${organizationId}/staff`, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          email: form.email || null,
          phone: form.phone || null,
          jobTitle: form.jobTitle || null,
        }),
      });
      router.push(`/staff/${row.id}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create staff.",
      );
    }
  }
  return (
    <AppShell title="New staff member">
      <section className="card">
        <form className="stack" onSubmit={submit}>
          <label>
            Display name
            <input
              required
              value={form.displayName}
              onChange={(e) =>
                setForm({ ...form, displayName: e.target.value })
              }
            />
          </label>
          <label>
            Job title
            <input
              value={form.jobTitle}
              onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
            />
          </label>
          <label>
            Phone
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          {message && <p className="error">{message}</p>}
          <button>Create staff member</button>
        </form>
      </section>
    </AppShell>
  );
}
