"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { AppShell } from "../components/app-shell";
import {
  api,
  resolveApiAssetUrl,
  selectedOrganization,
  type CurrentUser,
} from "../lib/api";
import { formatMinorCurrency } from "../lib/catalogue";
import type { Paged, PosProduct, Sale } from "../lib/sales";
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
  const [productTotal, setProductTotal] = useState(0);
  const [page, setPage] = useState(1);
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
  const [autoPrint, setAutoPrint] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale>();
  const [printJob, setPrintJob] = useState<{
    saleId: string;
    mode: "initial" | "reprint";
    nonce: number;
  }>();
  const searchRef = useRef<HTMLInputElement>(null);
  const productGridRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState(12);
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
  const enteredCashMinor = cashTender.trim()
    ? Math.round(Number(cashTender) * 100)
    : total;
  const validCash = Number.isFinite(enteredCashMinor) && enteredCashMinor >= 0;
  const changeDue = validCash ? Math.max(0, enteredCashMinor - total) : 0;
  const cashShortfall = validCash
    ? Math.max(0, total - enteredCashMinor)
    : total;
  const customer = customers.find((row) => row.id === customerId);

  const quickCash = useMemo(() => {
    const qar = total / 100;
    return Array.from(
      new Set([
        qar,
        Math.ceil(qar / 5) * 5,
        Math.ceil(qar / 10) * 10,
        Math.ceil(qar / 50) * 50,
        Math.ceil(qar / 100) * 100,
      ]),
    )
      .filter((value) => value >= qar && value > 0)
      .slice(0, 4);
  }, [total]);

  useEffect(() => {
    setAutoPrint(
      window.localStorage.getItem("allshops-pos-auto-print") !== "false",
    );
    const onFullscreen = () => {
      if (!document.fullscreenElement) setFocusMode(false);
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("pos-focus-mode", focusMode);
    return () => document.body.classList.remove("pos-focus-mode");
  }, [focusMode]);

  useEffect(() => {
    document.body.classList.add("pos-route-mode");
    return () => document.body.classList.remove("pos-route-mode");
  }, []);

  useEffect(() => {
    const grid = productGridRef.current;
    if (!grid || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const gap = 8;
      const columns = Math.max(1, Math.floor((grid.clientWidth + gap) / 112));
      const rows = Math.max(1, Math.floor((grid.clientHeight + gap) / 132));
      setPageSize(Math.max(4, Math.min(30, columns * rows)));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    measure();
    return () => observer.disconnect();
  }, []);

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
        `/organizations/${organizationId}/pos/products?branchId=${branchId}&page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(query)}`,
      )
        .then((result) => {
          setProducts(result.items);
          setProductTotal(result.total);
        })
        .catch(async (error) => {
          const cached = await cachedPosProducts(branchId);
          const normalized = query.trim().toLowerCase();
          const matches = cached.filter((product) =>
            [product.name, product.sku, product.barcode]
              .filter(Boolean)
              .some((value) =>
                String(value).toLowerCase().includes(normalized),
              ),
          );
          setProductTotal(matches.length);
          setProducts(matches.slice((page - 1) * pageSize, page * pageSize));
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
  }, [organizationId, branchId, query, page, pageSize]);

  useEffect(() => setPage(1), [branchId, query, focusMode, pageSize]);

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
    window.setTimeout(() => searchRef.current?.focus(), 0);
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
      const sale = await api<Sale>(
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
      setCompletedSale(sale);
      setCart([]);
      setCashTender("");
      setTerminalReference("");
      setDiscountType("");
      setDiscountValue("");
      if (autoPrint) {
        setPrintJob({ saleId: sale.id, mode: "initial", nonce: Date.now() });
      }
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
  function toggleAutoPrint() {
    const next = !autoPrint;
    setAutoPrint(next);
    window.localStorage.setItem("allshops-pos-auto-print", String(next));
  }
  async function toggleFocusMode() {
    if (focusMode) {
      if (document.fullscreenElement)
        await document.exitFullscreen().catch(() => undefined);
      setFocusMode(false);
      return;
    }
    setFocusMode(true);
    await document.documentElement.requestFullscreen?.().catch(() => undefined);
  }
  function newSale() {
    setCompletedSale(undefined);
    setPrintJob(undefined);
    setAppointmentId("");
    setCustomerId("");
    window.setTimeout(() => searchRef.current?.focus(), 0);
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
      <section className="pos-workspace">
        <header className="pos-command-bar">
          <div className="pos-brand-block">
            <span className="pos-live-dot" />
            <span>
              <strong>Live register</strong>
              <small>Scanner ready</small>
            </span>
          </div>
          <details className="pos-register-menu">
            <summary>
              <span>
                <small>Register options</small>
                <strong>
                  {branches.find((branch) => branch.id === branchId)?.name ??
                    "Choose branch"}
                </strong>
              </span>
              <span aria-hidden="true">⌄</span>
            </summary>
            <div className="pos-register-menu-panel">
              <label>
                Active branch
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
              </label>
              <label className="pos-auto-print">
                <input
                  type="checkbox"
                  checked={autoPrint}
                  onChange={toggleAutoPrint}
                />
                Auto-print receipt
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() => void toggleFocusMode()}
              >
                {focusMode ? "Exit full screen" : "Full screen"}
              </button>
            </div>
          </details>
        </header>
        <section className="pos-layout">
          <div className="card pos-products">
            <div className="toolbar">
              <input
                ref={searchRef}
                autoFocus
                aria-label="Search or scan barcode"
                placeholder="Search name, SKU, barcode — Enter to scan"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={scan}
              />
            </div>
            <div className="pos-section-heading">
              <span>
                <strong>{query ? "Search results" : "Main products"}</strong>
                <small>{productTotal} products available</small>
              </span>
              <span className="scanner-hint">⌁ Scan barcode + Enter</span>
            </div>
            <div className="product-grid" ref={productGridRef}>
              {products.map((product) => {
                const out =
                  product.trackInventory &&
                  !product.allowNegativeStock &&
                  Number(product.availableQuantity ?? 0) <= 0;
                const identity = Array.from(
                  new Set(
                    [
                      product.brandName,
                      product.variantName,
                      product.sku,
                    ].filter((value): value is string =>
                      Boolean(value?.trim()),
                    ),
                  ),
                )
                  .slice(0, 2)
                  .join(" · ");
                const tileSubtitle =
                  product.categoryName?.trim() ||
                  product.brandName?.trim() ||
                  "Uncategorized";
                const imageUrl = resolveApiAssetUrl(product.imageUrl);
                return (
                  <button
                    className="product-tile"
                    disabled={out}
                    key={`${product.productId}:${product.variantId ?? "base"}`}
                    onClick={() => add(product)}
                    title={`${product.name}${identity ? ` — ${identity}` : ""} — ${formatMinorCurrency(product.priceMinor)}`}
                  >
                    <ProductTileMedia imageUrl={imageUrl} name={product.name} />
                    <div className="product-tile-copy">
                      <strong>{product.name}</strong>
                      <small>{tileSubtitle}</small>
                    </div>
                  </button>
                );
              })}
            </div>
            {productTotal > pageSize && (
              <nav className="pos-pagination" aria-label="Product pages">
                <button
                  className="secondary"
                  disabled={page === 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  ← Previous
                </button>
                <span>
                  <strong>{(page - 1) * pageSize + 1}</strong>–
                  <strong>{Math.min(page * pageSize, productTotal)}</strong> of{" "}
                  {productTotal} · Page {page}/
                  {Math.ceil(productTotal / pageSize)}
                </span>
                <button
                  className="secondary"
                  disabled={page >= Math.ceil(productTotal / pageSize)}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next →
                </button>
              </nav>
            )}
          </div>
          <div className="card pos-cart">
            <div className="pos-cart-header">
              <h2>Cart</h2>
              <span>
                {cart.length} {cart.length === 1 ? "item" : "items"} · {formatMinorCurrency(total)}
              </span>
            </div>
            <div className="pos-cart-lines">
              {appointmentId && (
                <p className="notice">
                  Appointment services are preloaded at their booked prices. You
                  may add retail products before payment.
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
                                  staffProfileId:
                                    event.target.value || undefined,
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
            </div>
            <div className="pos-cart-calculator">
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
                    tenderMode === value
                      ? "product-tile active"
                      : "product-tile"
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
                <div className="cash-panel">
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
                <div className="quick-cash" aria-label="Quick cash amounts">
                  {quickCash.map((value) => (
                    <button
                      type="button"
                      className="secondary"
                      key={value}
                      onClick={() => setCashTender(value.toFixed(2))}
                    >
                      {value === total / 100
                        ? "Exact"
                        : `${value.toFixed(2)} QAR`}
                    </button>
                  ))}
                </div>
                <div
                  className={
                    cashShortfall > 0 ? "cash-change short" : "cash-change"
                  }
                >
                  <span>{cashShortfall > 0 ? "Still due" : "Change due"}</span>
                  <strong>
                    {formatMinorCurrency(
                      cashShortfall > 0 ? cashShortfall : changeDue,
                    )}
                  </strong>
                </div>
                </div>
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
                    onChange={(event) =>
                      setTerminalReference(event.target.value)
                    }
                  />
                </label>
                </div>
              )}
            </div>
            <div className="actions">
              <button
                className="secondary"
                disabled={busy || !cart.length}
                onClick={() => void hold()}
              >
                Hold
              </button>
              <button
                disabled={
                  busy ||
                  !cart.length ||
                  (tenderMode === "CASH" && (!validCash || cashShortfall > 0))
                }
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
      </section>
      {printJob && (
        <iframe
          className="receipt-print-frame"
          title="Receipt print job"
          src={`/sales/${printJob.saleId}/receipt?autoprint=1&mode=${printJob.mode}&job=${printJob.nonce}`}
        />
      )}
      {completedSale && (
        <div
          className="pos-success-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sale-complete-title"
        >
          <div className="pos-success-card">
            <span className="sale-check">✓</span>
            <p className="eyebrow">Payment approved</p>
            <h2 id="sale-complete-title">Sale complete</h2>
            <p className="muted">{completedSale.invoiceNumber}</p>
            <div className="sale-complete-numbers">
              <span>
                Total <b>{formatMinorCurrency(completedSale.totalMinor)}</b>
              </span>
              {tenderMode === "CASH" && (
                <span>
                  Cash received{" "}
                  <b>
                    {formatMinorCurrency(
                      completedSale.paidMinor + completedSale.changeMinor,
                    )}
                  </b>
                </span>
              )}
              <strong>
                Change due{" "}
                <b>{formatMinorCurrency(completedSale.changeMinor)}</b>
              </strong>
            </div>
            <p className="muted">
              {autoPrint
                ? "Receipt sent to the printer."
                : "Automatic receipt printing is off."}
            </p>
            <div className="actions">
              <button
                className="secondary"
                onClick={() =>
                  setPrintJob({
                    saleId: completedSale.id,
                    mode: "reprint",
                    nonce: Date.now(),
                  })
                }
              >
                Print again
              </button>
              <button onClick={newSale}>New sale</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function ProductTileMedia({
  imageUrl,
  name,
}: {
  imageUrl: string | null;
  name: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="product-tile-media">
      {imageUrl && !failed ? (
        // Product images are optimized as WebP by the API. A visible initials
        // fallback prevents empty tiles if an old file is missing in production.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="product-tile-image"
          src={imageUrl}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="product-tile-fallback" aria-hidden="true">
          {name.slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
}
