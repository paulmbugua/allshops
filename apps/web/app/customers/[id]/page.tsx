"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../../components/app-shell";
import { Can } from "../../components/permission-context";
import { api, selectedOrganization } from "../../lib/api";
import { formatMinorCurrency } from "../../lib/catalogue";
import { moneyInputToMinor, type Customer } from "../../lib/phase4";

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const organizationId = selectedOrganization();
  const [customer, setCustomer] = useState<Customer>();
  const [message, setMessage] = useState("");
  const load = () =>
    organizationId &&
    api<Customer>(`/organizations/${organizationId}/customers/${id}`)
      .then(setCustomer)
      .catch((error) => setMessage(error.message));
  useEffect(() => {
    void load();
  }, [organizationId, id]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const form = new FormData(event.currentTarget);
    const limit = String(form.get("limit") ?? "");
    try {
      await api(`/organizations/${organizationId}/customers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.get("name"),
          phone: String(form.get("phone") ?? "") || null,
          creditLimitMinor: limit ? moneyInputToMinor(limit) : null,
          isActive: form.get("active") === "on",
        }),
      });
      setMessage("Customer updated.");
      void load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed.");
    }
  }
  async function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const form = new FormData(event.currentTarget);
    try {
      await api(`/organizations/${organizationId}/customers/${id}/payments`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          amountMinor: moneyInputToMinor(String(form.get("amount"))),
          method: form.get("method"),
          reference: String(form.get("reference") ?? "") || null,
          paidAt: form.get("paidAt"),
          saleId: String(form.get("saleId") ?? "") || null,
        }),
      });
      setMessage("Payment recorded and allocated oldest-balance first.");
      event.currentTarget.reset();
      void load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment failed.");
    }
  }
  if (!customer)
    return (
      <AppShell title="Customer">
        <section className="card">
          <p>{message || "Loading…"}</p>
        </section>
      </AppShell>
    );
  const availableCredit =
    customer.balanceMinor !== undefined && customer.creditLimitMinor != null
      ? Math.max(0, customer.creditLimitMinor - customer.balanceMinor)
      : null;
  return (
    <AppShell title={customer.name}>
      <section className="card">
        <p>
          {customer.phone ?? "No phone"} · {customer.email ?? "No email"}
        </p>
        <div className="context-grid">
          <div>
            <small>Lifetime purchases</small>
            <strong>{formatMinorCurrency(customer.totalPurchasesMinor)}</strong>
          </div>
          <div>
            <small>Outstanding</small>
            <strong>
              {customer.balanceMinor === undefined
                ? "Restricted"
                : formatMinorCurrency(customer.balanceMinor)}
            </strong>
          </div>
          <div>
            <small>Credit limit</small>
            <strong>
              {customer.creditLimitMinor === undefined
                ? "Restricted"
                : customer.creditLimitMinor === null
                  ? "None"
                  : formatMinorCurrency(customer.creditLimitMinor)}
            </strong>
          </div>
          <div>
            <small>Available credit</small>
            <strong>
              {availableCredit === null
                ? "Unlimited / restricted"
                : formatMinorCurrency(availableCredit)}
            </strong>
          </div>
        </div>
        <Can permissions={["customer.update"]}>
          <form className="form compact" onSubmit={save}>
            <div className="form-grid">
              <label>
                Name
                <input name="name" defaultValue={customer.name} required />
              </label>
              <label>
                Phone
                <input name="phone" defaultValue={customer.phone ?? ""} />
              </label>
              {customer.creditLimitMinor !== undefined && (
                <label>
                  Credit limit QAR
                  <input
                    name="limit"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={
                      customer.creditLimitMinor === null
                        ? ""
                        : (customer.creditLimitMinor / 100).toFixed(2)
                    }
                  />
                </label>
              )}
              <label className="check-row">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={customer.isActive}
                />{" "}
                Active
              </label>
            </div>
            <button>Save profile</button>
          </form>
        </Can>
        {customer.balanceMinor !== undefined && customer.balanceMinor > 0 && (
          <Can permissions={["customer_payment.create"]}>
            <form className="form compact" onSubmit={pay}>
              <h2>Record repayment</h2>
              <p className="muted">
                The projected balance is the outstanding amount less this
                payment. Leave sale blank for oldest-balance-first allocation.
              </p>
              <div className="form-grid">
                <label>
                  Amount QAR
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    max={(customer.balanceMinor / 100).toFixed(2)}
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
                  Reference
                  <input name="reference" />
                </label>
                <label>
                  Payment date
                  <input
                    name="paidAt"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                  />
                </label>
                <label>
                  Apply to sale (optional)
                  <select name="saleId">
                    <option value="">Oldest balance first</option>
                    {customer.sales
                      ?.filter((sale) => sale.balanceMinor > 0)
                      .map((sale) => (
                        <option key={sale.id} value={sale.id}>
                          {sale.invoiceNumber} ·{" "}
                          {formatMinorCurrency(sale.balanceMinor)}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <button>Record repayment</button>
            </form>
          </Can>
        )}
        <h2>Credit sales</h2>
        <div className="table-list">
          {customer.sales?.map((sale) => (
            <div className="table-row" key={sale.id}>
              <Link href={`/sales/${sale.id}`}>{sale.invoiceNumber}</Link>
              <span>{formatMinorCurrency(sale.totalMinor)}</span>
              <b>Due {formatMinorCurrency(sale.balanceMinor)}</b>
            </div>
          ))}
        </div>
        {customer.payments && (
          <>
            <h2>Payments</h2>
            <div className="table-list">
              {customer.payments.map((row) => (
                <div className="table-row" key={row.id}>
                  <span>{new Date(row.paidAt).toLocaleDateString()}</span>
                  <span>{row.method}</span>
                  <b>{formatMinorCurrency(row.amountMinor)}</b>
                </div>
              ))}
            </div>
          </>
        )}
        {customer.ledger && (
          <>
            <h2>Ledger</h2>
            <div className="table-list">
              {customer.ledger.map((row) => (
                <div className="table-row" key={row.id}>
                  <span>
                    {new Date(row.occurredAt).toLocaleDateString()} ·{" "}
                    {row.entryType}
                  </span>
                  <span>
                    {row.debitMinor
                      ? `Debit ${formatMinorCurrency(row.debitMinor)}`
                      : `Credit ${formatMinorCurrency(row.creditMinor)}`}
                  </span>
                  <b>{formatMinorCurrency(row.balanceAfterMinor)}</b>
                </div>
              ))}
            </div>
          </>
        )}
        {message && <p className="notice">{message}</p>}
      </section>
    </AppShell>
  );
}
