"use client";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../components/app-shell";
import { api, selectedOrganization } from "../lib/api";
import type { ExpenseCategory, Paged } from "../lib/phase4";

export default function ExpenseCategoriesPage() {
  const organizationId = selectedOrganization();
  const [rows, setRows] = useState<ExpenseCategory[]>([]);
  const [message, setMessage] = useState("");
  const load = () =>
    organizationId &&
    api<Paged<ExpenseCategory>>(
      `/organizations/${organizationId}/expense-categories?pageSize=100`,
    )
      .then((value) => setRows(value.items))
      .catch((error) => setMessage(error.message));
  useEffect(() => {
    void load();
  }, [organizationId]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const form = new FormData(event.currentTarget);
    try {
      await api(`/organizations/${organizationId}/expense-categories`, {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          description: String(form.get("description") ?? "") || null,
        }),
      });
      event.currentTarget.reset();
      void load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create category.",
      );
    }
  }
  async function toggle(row: ExpenseCategory) {
    if (!organizationId) return;
    try {
      await api(
        `/organizations/${organizationId}/expense-categories/${row.id}`,
        { method: "PATCH", body: JSON.stringify({ isActive: !row.isActive }) },
      );
      void load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed.");
    }
  }
  return (
    <AppShell title="Expense categories">
      <section className="card">
        <form className="toolbar" onSubmit={create}>
          <input name="name" placeholder="Category name" required />
          <input name="description" placeholder="Description (optional)" />
          <button>Add category</button>
        </form>
        {message && <p className="error">{message}</p>}
        <div className="table-list">
          {rows.map((row) => (
            <div className="table-row" key={row.id}>
              <span>
                <b>{row.name}</b>
                <small>{row.description ?? "No description"}</small>
              </span>
              <span className={`pill ${row.isActive ? "active" : ""}`}>
                {row.isActive ? "Active" : "Inactive"}
              </span>
              <button className="secondary" onClick={() => void toggle(row)}>
                {row.isActive ? "Deactivate" : "Activate"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
