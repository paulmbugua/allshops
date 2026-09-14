"use client";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { AppShell } from "../components/app-shell";
import { api, selectedOrganization, type CurrentUser } from "../lib/api";
import { formatMinorCurrency } from "../lib/catalogue";
import type { Paged, PosProduct } from "../lib/sales";
import type { Appointment } from "../lib/phase5";
import {
  cachedPosProductByBarcode,
  cachedPosProducts,
  getOfflineMetadata,
  type OfflineBranchContext,
} from "../lib/offline-db";

interface Branch {
  id: string;
  name: string;
}
interface CartLine extends PosProduct {
  quantity: string;
  staffProfileId?: string;
  appointmentLine?: boolean;
}
interface Customer {
  id: string;
  name: string;
  phone: string | null;
  balanceMinor?: number;
  creditLimitMinor?: number | null;
}
type TenderMode = "CASH" | "LOCAL_CARD";

export default function PosPage() {
  const organizationId = selectedOrganization();
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountType, setDiscountType] = useState("");
  const [discountValue, setDiscountValue] = useState("");
  const [canDiscount, setCanDiscount] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [appointmentId, setAppointmentId] = useState("");
  const [tenderMode, setTenderMode] = useState<TenderMode>("CASH");
  const [cashTender, setCashTender] = useState("");
  const [localBank, setLocalBank] = useState("QNB");
  const [terminalReference, setTerminalReference] = useState("");
  const subtotal = useMemo(
    () =>
      cart.reduce(
        (sum, line) =>
          sum + Math.round(line.priceMinor * Number(line.quantity || 0)),
        0,
      ),
    [cart],
  );
  const discount =
    discountType === "FIXED"
      ? Math.round(Number(discountValue || 0) * 100)
      : discountType === "PERCENTAGE"
        ? Math.round((subtotal * Number(discountValue || 0)) / 100)
        : 0;
  const total = Math.max(0, subtotal - discount);
  const customer = customers.find((row) => row.id === customerId);

  useEffect(() => {
    void (async () => {
      if (!organizationId) {
        window.location.assign("/onboarding");
        return;
      }
      const cachedContext =
        await getOfflineMetadata<OfflineBranchContext>("branchContext");
      if (cachedContext?.organizationId === organizationId) {
        setBranches([
          { id: cachedContext.branchId, name: cachedContext.branchName },
        ]);
        setBranchId(cachedContext.branchId);
      }
      try {
        const [branchRows, current, customerRows] = await Promise.all([
          api<Branch[]>(`/organizations/${organizationId}/branches`),
          api<CurrentUser>("/auth/me"),
          api<Paged<Customer>>(
            `/organizations/${organizationId}/customers?pageSize=100&isActive=true`,
          ).catch(() => ({ items: [], page: 1, pageSize: 100, total: 0 })),
        ]);
        setBranches(branchRows);
        const membership = current.memberships.find(
          (row) => row.organizationId === organizationId,
        );
        setCanDiscount(
          membership?.permissions.includes("sale.discount") ?? false,
        );
        setCustomers(customerRows.items);
        setBranchId(membership?.branchId ?? branchRows[0]?.id ?? "");
        const requestedAppointment = new URLSearchParams(
          window.location.search,
        ).get("appointmentId");
        if (requestedAppointment) {
          const appointment = await api<Appointment>(
            `/organizations/${organizationId}/appointments/${requestedAppointment}`,
          );
          if (appointment.status !== "COMPLETED" || appointment.sale)
            throw new Error(
              "Only an unchecked completed appointment can be opened in POS.",
            );
          setAppointmentId(appointment.id);
          setBranchId(appointment.branch.id);
          setCustomerId(appointment.customer?.id ?? "");
          setCart(
            appointment.services.map((service) => ({
              productId: service.serviceProductId,
              variantId: null,
              name: service.serviceNameSnapshot,
              variantName: null,
              sku: null,
              barcode: null,
              type: "SERVICE",
              priceMinor: service.priceMinorSnapshot,
              trackInventory: false,
              allowNegativeStock: false,
              availableQuantity: null,
              unitSymbol: "service",
              quantity: "1",
              staffProfileId: service.staffProfileId,
              appointmentLine: true,
              availableStaff: [
                {
                  id: service.staffProfileId,
                  displayName: service.staffProfile.displayName,
                  priceMinor: service.priceMinorSnapshot,
                },
              ],
            })),
          );
        }
      } catch (error) {
        setMessage(
          cachedContext?.organizationId === organizationId
            ? "Offline catalogue — prices and stock are cached snapshots."
            : error instanceof Error
              ? error.message
              : "Unable to open POS.",
        );
      }
    })();
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId || !branchId) return;
    const timer = window.setTimeout(() => {
      void api<Paged<PosProduct>>(
        `/organizations/${organizationId}/pos/products?branchId=${branchId}&pageSize=40&search=${encodeURIComponent(query)}`,
      )
        .then((result) => setProducts(result.items))
        .catch(async (error) => {
          const cached = await cachedPosProducts(branchId);
          const normalized = query.trim().toLowerCase();
          setProducts(
            cached.filter((product) =>
              [product.name, product.sku, product.barcode]
                .filter(Boolean)
                .some((value) =>
                  String(value).toLowerCase().includes(normalized),
                ),
            ),
          );
          setMessage(
            cached.length
              ? "Offline catalogue — prices and stock are cached snapshots."
              : error instanceof Error
                ? error.message
                : "Search failed.",
          );
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [organizationId, branchId, query]);

  function add(product: PosProduct) {
    if (
      product.trackInventory &&
      !product.allowNegativeStock &&
      Number(product.availableQuantity ?? 0) <= 0
    )
      return;
    setCart((rows) => {
      const index = rows.findIndex(
        (row) =>
          row.productId === product.productId &&
          row.variantId === product.variantId,
      );
      if (index < 0) return [...rows, { ...product, quantity: "1" }];
      return rows.map((row, rowIndex) =>
        rowIndex === index
          ? { ...row, quantity: String(Number(row.quantity) + 1) }
          : row,
      );
    });
  }
  async function scan(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const barcode = event.currentTarget.value.trim();
    if (!barcode || !organizationId || !branchId) return;
    let product: PosProduct | null = null;
    let offline = false;
    try {
      product = await api<PosProduct | null>(
        `/organizations/${organizationId}/pos/products/barcode?branchId=${branchId}&barcode=${encodeURIComponent(barcode)}`,
      );
    } catch {
      offline = true;
      product = await cachedPosProductByBarcode(branchId, barcode);
    }
    if (!product) {
      setMessage(`No product found for barcode ${barcode}.`);
      return;
    }
    if (
      product.trackInventory &&
      !product.allowNegativeStock &&
      Number(product.availableQuantity ?? 0) <= 0
    ) {
      setMessage(`${product.name} is out of stock.`);
      return;
    }
    add(product);
    setQuery((current) => (current.trim() === barcode ? "" : current));
    setMessage(
      offline
        ? `${product.name} added from the offline catalogue.`
        : `${product.name} added.`,
    );
  }
  function changeBranch(next: string) {
    if (appointmentId) {
      setMessage("The branch is fixed by the appointment.");
      return;
    }
    if (
      cart.length &&
      !window.confirm("Changing branch will clear the current cart. Continue?")
    )
      return;
    setCart([]);
    setBranchId(next);
  }
  function payload() {
    return {
      branchId,
      ...(customerId ? { customerId } : {}),
      items: cart.map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        ...(line.staffProfileId ? { staffProfileId: line.staffProfileId } : {}),
        quantity: line.quantity,
      })),
      ...(canDiscount && discountType
        ? {
            discount:
              discountType === "FIXED"
                ? {
                    type: "FIXED",
                    valueMinor: Math.round(Number(discountValue) * 100),
                  }
                : {
                    type: "PERCENTAGE",
                    basisPoints: Math.round(Number(discountValue) * 100),
                  },
          }
        : {}),
    };
  }
  async function checkout() {
    if (!organizationId || !cart.length) return;
    setBusy(true);
    setMessage("");
    try {
      const basePayload = payload();
      const appointmentPayload = {
        additionalItems: basePayload.items.filter(
          (_item, index) => !cart[index]?.appointmentLine,
        ),
        ...(canDiscount && discountType
          ? { discount: basePayload.discount }
          : {}),
      };
      if (!navigator.onLine)
        throw new Error(
          "Reconnect to record this payment, or use an authorized offline register.",
        );
      const tenderedMinor = cashTender
        ? Math.round(Number(cashTender) * 100)
        : total;
      if (tenderMode === "CASH" && tenderedMinor < total)
        throw new Error("Cash received cannot be less than the sale total.");
      const payment =
        tenderMode === "CASH"
          ? { method: "CASH", amountMinor: tenderedMinor }
          : {
              method: "CARD",
              amountMinor: total,
              reference: `LOCAL:${localBank}:${terminalReference.trim() || "NO-REFERENCE"}`,
            };
      const sale = await api<{ id: string }>(
        appointmentId
          ? `/organizations/${organizationId}/appointments/${appointmentId}/checkout`
          : `/organizations/${organizationId}/sales/checkout`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify(
            appointmentId
              ? { ...appointmentPayload, payments: [payment] }
              : { ...basePayload, payments: [payment] },
          ),
        },
      );
      window.location.assign(`/sales/${sale.id}`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Checkout failed; the cart was kept.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function hold() {
    if (!organizationId || !cart.length || appointmentId) return;
    setBusy(true);
    setMessage("");
    try {
      await api(`/organizations/${organizationId}/sales/held`, {
        method: "POST",
        body: JSON.stringify(payload()),
      });
      setCart([]);
      setMessage("Sale held without reserving stock.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to hold sale.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppShell title="Point of Sale">
      <section className="pos-layout">
        <div className="card pos-products">
          <div className="toolbar">
            <select
              aria-label="Active branch"
              value={branchId}
              onChange={(event) => changeBranch(event.target.value)}
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            <input
              autoFocus
              aria-label="Search or scan barcode"
              placeholder="Search name, SKU, barcode — Enter to scan"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={scan}
            />
          </div>
          <div className="product-grid">
            {products.map((product) => {
              const out =
                product.trackInventory &&
                !product.allowNegativeStock &&
                Number(product.availableQuantity ?? 0) <= 0;
              return (
                <button
                  className="product-tile"
                  disabled={out}
                  key={`${product.productId}:${product.variantId ?? "base"}`}
                  onClick={() => add(product)}
                >
                  {product.imageUrl && (
                    // API-hosted product images are normalized and cached as WebP.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="product-tile-image"
                      src={product.imageUrl}
                      alt=""
                      loading="lazy"
                    />
                  )}
                  <strong>{product.name}</strong>
                  <span>{product.variantName ?? product.sku ?? "Base"}</span>
                  <b>{formatMinorCurrency(product.priceMinor)}</b>
                  {product.trackInventory && (
                    <small>
                      {out
                        ? "OUT OF STOCK"
                        : `Available: ${product.availableQuantity}`}
                    </small>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="card pos-cart">
          <h2>Cart</h2>
          {appointmentId && (
            <p className="notice">
              Appointment services are preloaded at their booked prices. You may
              add retail products before payment.
            </p>
          )}
          {cart.length === 0 && (
            <p className="muted">Scan or select a product.</p>
          )}
          {cart.map((line) => (
            <div
              className="cart-line"
              key={`${line.productId}:${line.variantId ?? "base"}`}
            >
              <span>
                <strong>{line.name}</strong>
                <small>{line.variantName ?? line.sku ?? ""}</small>
              </span>
              <input
                aria-label={`Quantity for ${line.name}`}
                value={line.quantity}
                onChange={(event) =>
                  setCart((rows) =>
                    rows.map((row) =>
                      row === line
                        ? { ...row, quantity: event.target.value }
                        : row,
                    ),
                  )
                }
              />
              {line.type === "SERVICE" && (
                <select
                  aria-label={`Staff for ${line.name}`}
                  value={line.staffProfileId ?? ""}
                  onChange={(event) =>
                    setCart((rows) =>
                      rows.map((row) =>
                        row === line
                          ? {
                              ...row,
                              staffProfileId: event.target.value || undefined,
                            }
                          : row,
                      ),
                    )
                  }
                >
                  <option value="">No staff</option>
                  {line.availableStaff?.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.displayName}
                    </option>
                  ))}
                </select>
              )}
              <b>
                {formatMinorCurrency(
                  Math.round(line.priceMinor * Number(line.quantity || 0)),
                )}
              </b>
              <button
                className="danger"
                disabled={line.appointmentLine}
                onClick={() =>
                  setCart((rows) => rows.filter((row) => row !== line))
                }
              >
                ×
              </button>
            </div>
          ))}
          {canDiscount && (
            <div className="discount-row">
              <select
                aria-label="Discount type"
                value={discountType}
                onChange={(event) => setDiscountType(event.target.value)}
              >
                <option value="">No discount</option>
                <option value="FIXED">Fixed QAR</option>
                <option value="PERCENTAGE">Percentage</option>
              </select>
              <input
                aria-label="Discount value"
                type="number"
                min="0"
                max={discountType === "PERCENTAGE" ? 100 : undefined}
                value={discountValue}
                onChange={(event) => setDiscountValue(event.target.value)}
              />
            </div>
          )}
          <div className="totals">
            <span>
              Subtotal <b>{formatMinorCurrency(subtotal)}</b>
            </span>
            <span>
              Discount <b>− {formatMinorCurrency(discount)}</b>
            </span>
            <span>
              Tax <b>{formatMinorCurrency(0)}</b>
            </span>
            <strong>
              Total <b>{formatMinorCurrency(total)}</b>
            </strong>
          </div>
          <h3>Payment</h3>
          <label>
            Customer (optional)
            <select
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
            >
              <option value="">Walk-in customer</option>
              {customers.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                  {row.phone ? ` · ${row.phone}` : ""}
                </option>
              ))}
            </select>
          </label>
          {customer && (
            <p className="muted">
              Outstanding {formatMinorCurrency(customer.balanceMinor ?? 0)}
              {customer.creditLimitMinor == null
                ? " · No credit limit"
                : ` · Limit ${formatMinorCurrency(customer.creditLimitMinor)}`}
            </p>
          )}
          <div className="payment-choice-grid">
            {(
              [
                ["CASH", "Cash", "Record cash and calculate change."],
                [
                  "LOCAL_CARD",
                  "Local bank card",
                  "Record approval from your own terminal.",
                ],
              ] as const
            ).map(([value, title, description]) => (
              <button
                type="button"
                className={
                  tenderMode === value ? "product-tile active" : "product-tile"
                }
                key={value}
                onClick={() => setTenderMode(value)}
              >
                <strong>{title}</strong>
                <small>{description}</small>
              </button>
            ))}
          </div>
          {tenderMode === "CASH" && (
            <label>
              Cash received (QAR)
              <input
                type="number"
                min={total / 100}
                step="0.01"
                placeholder={(total / 100).toFixed(2)}
                value={cashTender}
                onChange={(event) => setCashTender(event.target.value)}
              />
            </label>
          )}
          {tenderMode === "LOCAL_CARD" && (
            <div className="payment-row">
              <label>
                Acquiring bank / terminal
                <select
                  value={localBank}
                  onChange={(event) => setLocalBank(event.target.value)}
                >
                  <option>QNB</option>
                  <option>Doha Bank</option>
                  <option>Commercial Bank</option>
                  <option>QIB</option>
                  <option>Dukhan Bank</option>
                  <option>Ahlibank</option>
                  <option>Other local terminal</option>
                </select>
              </label>
              <label>
                Terminal reference (optional)
                <input
                  maxLength={80}
                  value={terminalReference}
                  onChange={(event) => setTerminalReference(event.target.value)}
                />
              </label>
            </div>
          )}
          <div className="actions">
            <button
              className="secondary"
              disabled={busy || !cart.length}
              onClick={() => void hold()}
            >
              Hold
            </button>
            <button
              disabled={busy || !cart.length}
              onClick={() => void checkout()}
            >
              {busy
                ? "Processing…"
                : tenderMode === "CASH"
                  ? "Complete cash sale"
                  : "Record local card sale"}
            </button>
          </div>
          {message && <p className="notice">{message}</p>}
        </div>
      </section>
    </AppShell>
  );
}
