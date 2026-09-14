"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../../components/app-shell";
import { api, selectedOrganization } from "../../lib/api";
import {
  moneyInputToMinor,
  today,
  type Branch,
  type Expense,
  type ExpenseCategory,
  type Paged,
} from "../../lib/phase4";

export default function NewExpensePage() {
  const organizationId = selectedOrganization();
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!organizationId) return;
    void Promise.all([
      api<Branch[]>(`/organizations/${organizationId}/branches`),
      api<Paged<ExpenseCategory>>(
        `/organizations/${organizationId}/expense-categories?pageSize=100&isActive=true`,
      ),
    ])
      .then(([b, c]) => {
        setBranches(b);
        setCategories(c.items);
      })
      .catch((error) => setMessage(error.message));
  }, [organizationId]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const form = new FormData(event.currentTarget);
    try {
      const expense = await api<Expense>(
        `/organizations/${organizationId}/expenses`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({
            branchId: form.get("branchId"),
            categoryId: form.get("categoryId"),
            amountMinor: moneyInputToMinor(String(form.get("amount"))),
            paymentMethod: form.get("method"),
            expenseDate: form.get("date"),
            description: String(form.get("description") ?? "") || null,
            reference: String(form.get("reference") ?? "") || null,
            attachmentUrl: String(form.get("attachment") ?? "") || null,
          }),
        },
      );
      router.push(`/expenses?recorded=${expense.id}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to record expense.",
      );
    }
  }
  return (
    <AppShell title="Record expense">
      <section className="card">
        <p className="muted">
          Recorded expenses are immutable financial events. Corrections should
          be entered as explicit compensating records.
        </p>
        <form className="form" onSubmit={submit}>
          <div className="form-grid">
            <label>
              Branch
              <select name="branchId" required>
                <option value="">Select branch</option>
                {branches.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Category
              <select name="categoryId" required>
                <option value="">Select category</option>
                {categories.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Amount QAR
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
              />
            </label>
            <label>
              Method
              <select name="method">
                <option>CASH</option>
                <option>CARD</option>
                <option>BANK_TRANSFER</option>
                <option>QR</option>
                <option>OTHER</option>
              </select>
            </label>
            <label>
              Date
              <input name="date" type="date" defaultValue={today()} required />
            </label>
            <label>
              Reference
              <input name="reference" />
            </label>
            <label>
              Attachment URL
              <input name="attachment" type="url" />
            </label>
          </div>
          <label>
            Description
            <textarea name="description" />
          </label>
          {message && <p className="error">{message}</p>}
          <button>Record expense</button>
        </form>
      </section>
    </AppShell>
  );
}
