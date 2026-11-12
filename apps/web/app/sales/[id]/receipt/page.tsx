"use client";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, selectedOrganization } from "../../../lib/api";
import { formatMinorCurrency } from "../../../lib/catalogue";
import type { Sale } from "../../../lib/sales";
export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const organizationId = selectedOrganization();
  const [sale, setSale] = useState<Sale>();
  const [message, setMessage] = useState("");
  const autoPrintStarted = useRef(false);
  useEffect(() => {
    if (!organizationId) {
      window.location.assign("/login");
      return;
    }
    const mode = new URLSearchParams(window.location.search).get("mode");
    void api<Sale>(
      `/organizations/${organizationId}/sales/${id}/receipt${mode ? `?mode=${encodeURIComponent(mode)}` : ""}`,
    )
      .then(setSale)
      .catch((error) =>
        setMessage(
          error instanceof Error ? error.message : "Unable to load receipt.",
        ),
      );
  }, [organizationId, id]);
  useEffect(() => {
    if (!sale || autoPrintStarted.current) return;
    if (new URLSearchParams(window.location.search).get("autoprint") !== "1")
      return;
    autoPrintStarted.current = true;
    const timer = window.setTimeout(() => window.print(), 350);
    return () => window.clearTimeout(timer);
  }, [sale]);
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
            <p lang="sw">{sale.organization.arabicName}</p>
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
          {new Date(sale.completedAt ?? sale.createdAt).toLocaleString("en-KE")}
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
        {sale.fiscalDocument?.status === "ACCEPTED" ? (
          <section className="receipt-fiscal">
            <b>KRA eTIMS fiscal receipt</b>
            <span>Receipt: {sale.fiscalDocument.currentReceiptNumber}</span>
            <span>Internal data: {sale.fiscalDocument.internalData}</span>
            <span>Signature: {sale.fiscalDocument.receiptSignature}</span>
            {sale.fiscalDocument.environment === "SANDBOX" && (
              <strong>TEST / SANDBOX — NOT A PRODUCTION TAX INVOICE</strong>
            )}
          </section>
        ) : sale.fiscalStatus && sale.fiscalStatus !== "NOT_REQUIRED" ? (
          <section className="receipt-fiscal pending">
            <b>KRA eTIMS: {sale.fiscalStatus}</b>
            <span>
              This operational receipt is not yet a KRA-accepted tax invoice.
            </span>
          </section>
        ) : null}
        <footer>
          <p>Thank you</p>
          <p lang="sw">Asante sana</p>
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
