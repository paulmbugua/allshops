"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, selectedOrganization } from "../../../lib/api";
import { formatMinorCurrency } from "../../../lib/catalogue";
import type { Sale } from "../../../lib/sales";
export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const organizationId = selectedOrganization();
  const [sale, setSale] = useState<Sale>();
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!organizationId) {
      window.location.assign("/login");
      return;
    }
    void api<Sale>(`/organizations/${organizationId}/sales/${id}/receipt`)
      .then(setSale)
      .catch((error) =>
        setMessage(
          error instanceof Error ? error.message : "Unable to load receipt.",
        ),
      );
  }, [organizationId, id]);
  if (!sale)
    return (
      <main className="receipt-page">
        <p>{message || "Loading receipt…"}</p>
      </main>
    );
  return (
    <main className="receipt-page">
      <article className="receipt">
        <header>
          <h1>{sale.organization?.name}</h1>
          {sale.organization?.arabicName && (
            <p lang="ar">{sale.organization.arabicName}</p>
          )}
          <p>
            {sale.branch.name}
            <br />
            {sale.branch.address}
            <br />
            {sale.branch.phone ?? sale.organization?.phone}
          </p>
        </header>
        <hr />
        <p>
          <b>{sale.invoiceNumber}</b>
          <br />
          {new Date(sale.completedAt ?? sale.createdAt).toLocaleString("en-QA")}
          <br />
          Cashier: {sale.creator.name}
          {sale.customerName && (
            <>
              <br />
              Customer: {sale.customerName}
            </>
          )}
        </p>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.productNameSnapshot}
                  {item.variantNameSnapshot
                    ? ` · ${item.variantNameSnapshot}`
                    : ""}
                </td>
                <td>{item.quantity}</td>
                <td>{formatMinorCurrency(item.unitPriceMinor)}</td>
                <td>{formatMinorCurrency(item.totalMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr />
        <div className="receipt-totals">
          <span>
            Subtotal <b>{formatMinorCurrency(sale.subtotalMinor)}</b>
          </span>
          <span>
            Discount <b>− {formatMinorCurrency(sale.discountMinor)}</b>
          </span>
          <span>
            Tax <b>{formatMinorCurrency(sale.taxMinor)}</b>
          </span>
          <strong>
            TOTAL <b>{formatMinorCurrency(sale.totalMinor)}</b>
          </strong>
        </div>
        <hr />
        {sale.payments.map((payment) => (
          <p key={payment.id}>
            {payment.method.replaceAll("_", " ")}:{" "}
            {formatMinorCurrency(payment.amountMinor)}
            {payment.tenderedMinor !== null && (
              <>
                <br />
                Tendered: {formatMinorCurrency(payment.tenderedMinor)}
              </>
            )}
          </p>
        ))}
        {sale.changeMinor > 0 && (
          <p>
            <b>Change: {formatMinorCurrency(sale.changeMinor)}</b>
          </p>
        )}
        {sale.balanceMinor > 0 && (
          <p>
            <b>
              Paid: {formatMinorCurrency(sale.paidMinor)}
              <br />
              Balance due: {formatMinorCurrency(sale.balanceMinor)}
            </b>
          </p>
        )}
        <footer>
          <p>Thank you</p>
          <p lang="ar">شكراً لكم</p>
        </footer>
      </article>
      <div className="print-actions">
        <button onClick={() => window.print()}>Print receipt</button>
        <button
          className="secondary"
          onClick={() => window.location.assign(`/sales/${sale.id}`)}
        >
          Back
        </button>
      </div>
    </main>
  );
}
