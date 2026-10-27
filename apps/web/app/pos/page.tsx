"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { AppShell } from "../components/app-shell";
import {
  api,
  clearSession,
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
type ProductTileMode = "QUICK" | "IMAGE";

const productKey = (product: Pick<PosProduct, "productId" | "variantId">) =>
  `${product.productId}:${product.variantId ?? "base"}`;

export default function PosPage() {
  const organizationId = selectedOrganization();
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [productTotal, setProductTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser>();
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
  const [splitTender, setSplitTender] = useState(false);
  const [splitCash, setSplitCash] = useState("");
  const [cashTender, setCashTender] = useState("");
  const [localBank, setLocalBank] = useState("KCB");
  const [terminalReference, setTerminalReference] = useState("");
  const [autoPrint, setAutoPrint] = useState(true);
  const [celebrationMode, setCelebrationMode] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [paymentPanelOpen, setPaymentPanelOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale>();
  const [previousSale, setPreviousSale] = useState<Sale>();
  const [productTileMode, setProductTileMode] =
    useState<ProductTileMode>("QUICK");
  const [customizingQuickItems, setCustomizingQuickItems] = useState(false);
  const [pinnedProductKeys, setPinnedProductKeys] = useState<string[]>([]);
  const [salesCounts, setSalesCounts] = useState<Record<string, number>>({});
  const [quickProductSnapshots, setQuickProductSnapshots] = useState<
    PosProduct[]
  >([]);
  const [selectedCartKey, setSelectedCartKey] = useState("");
  const [keypadTarget, setKeypadTarget] = useState<"QUANTITY" | "CASH">(
    "QUANTITY",
  );
  const [printJob, setPrintJob] = useState<{
    saleId: string;
    mode: "initial" | "reprint";
    nonce: number;
  }>();
  const searchRef = useRef<HTMLInputElement>(null);
  const cashTenderRef = useRef<HTMLInputElement>(null);
  const paymentRef = useRef<HTMLDivElement>(null);
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
  const currentMembership = currentUser?.memberships.find(
    (row) => row.organizationId === organizationId,
  );
  const cashierIdentity =
    currentMembership?.employeeNumber || currentUser?.email || "Loading user…";
  const splitCashMinor = splitCash.trim()
    ? Math.round(Number(splitCash) * 100)
    : 0;
  const splitCardMinor = Math.max(0, total - splitCashMinor);
  const splitValid =
    Number.isFinite(splitCashMinor) && splitCashMinor > 0 && splitCashMinor < total;
  const canCompleteSale =
    !busy &&
    cart.length > 0 &&
    !(
      !splitTender &&
      tenderMode === "CASH" &&
      (!validCash || cashShortfall > 0)
    ) &&
    !(splitTender && !splitValid);

  const quickProducts = useMemo(() => {
    const combined = new Map<string, PosProduct>();
    for (const product of [...quickProductSnapshots, ...products])
      combined.set(productKey(product), product);
    return [...combined.values()]
      .sort((left, right) => {
        const leftKey = productKey(left);
        const rightKey = productKey(right);
        const leftPinned = pinnedProductKeys.includes(leftKey) ? 1 : 0;
        const rightPinned = pinnedProductKeys.includes(rightKey) ? 1 : 0;
        return (
          rightPinned - leftPinned ||
          (salesCounts[rightKey] ?? 0) - (salesCounts[leftKey] ?? 0) ||
          left.name.localeCompare(right.name)
        );
      })
      .slice(0, Math.max(8, Math.min(18, pageSize)));
  }, [pageSize, pinnedProductKeys, products, quickProductSnapshots, salesCounts]);

  const displayedProducts = query.trim() ? products : quickProducts;

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
    setCelebrationMode(
      window.localStorage.getItem("allshops-pos-celebration-mode") === "true",
    );
    const onFullscreen = () => {
      if (!document.fullscreenElement) setFocusMode(false);
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  useEffect(() => {
    if (!organizationId || !branchId) return;
    const prefix = `allshops-pos:${organizationId}:${branchId}`;
    try {
      const storedMode = window.localStorage.getItem(`${prefix}:tile-mode`);
      setProductTileMode(storedMode === "IMAGE" ? "IMAGE" : "QUICK");
      setPinnedProductKeys(
        JSON.parse(window.localStorage.getItem(`${prefix}:pinned`) ?? "[]"),
      );
      setSalesCounts(
        JSON.parse(window.localStorage.getItem(`${prefix}:sales-counts`) ?? "{}"),
      );
      setQuickProductSnapshots(
        JSON.parse(window.localStorage.getItem(`${prefix}:products`) ?? "[]"),
      );
    } catch {
      setPinnedProductKeys([]);
      setSalesCounts({});
      setQuickProductSnapshots([]);
    }
  }, [branchId, organizationId]);

  useEffect(() => {
    document.body.classList.toggle("pos-focus-mode", focusMode);
    return () => document.body.classList.remove("pos-focus-mode");
  }, [focusMode]);

  useEffect(() => {
    document.body.classList.add("pos-route-mode");
    return () => document.body.classList.remove("pos-route-mode");
  }, []);

  // Keep the register fast for keyboard-first cashiers. Enter confirms the
  // completion dialog, Ctrl/Cmd+K jumps to scan/search, and function keys map
  // to the actions printed on the large desktop controls.
  useEffect(() => {
    const onShortcut = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";
      if (completedSale && event.key === "Enter") {
        event.preventDefault();
        newSale();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (!editing && event.key === "F2") {
        event.preventDefault();
        startNewTicket();
        return;
      }
      if (!editing && event.key === "F7") {
        event.preventDefault();
        clearTicket();
        return;
      }
      if (!editing && event.key === "F8") {
        event.preventDefault();
        void hold();
        return;
      }
      if (!editing && event.key === "F9") {
        event.preventDefault();
        setPaymentPanelOpen(true);
        window.setTimeout(() => {
          paymentRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          cashTenderRef.current?.focus();
        }, 0);
        return;
      }
      if (!editing && event.key === "F11" && previousSale) {
        event.preventDefault();
        setPrintJob({
          saleId: previousSale.id,
          mode: "reprint",
          nonce: Date.now(),
        });
        return;
      }
      if (!editing && event.key === "F12" && canCompleteSale) {
        event.preventDefault();
        void checkout();
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [cart.length, completedSale, previousSale, total, cashTender, splitCash]);

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
        setCurrentUser(current);
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

  function preferencePrefix() {
    return `allshops-pos:${organizationId}:${branchId}`;
  }

  function selectTileMode(mode: ProductTileMode) {
    setProductTileMode(mode);
    if (organizationId && branchId)
      window.localStorage.setItem(`${preferencePrefix()}:tile-mode`, mode);
  }

  function togglePinnedProduct(product: PosProduct) {
    const key = productKey(product);
    setPinnedProductKeys((current) => {
      const next = current.includes(key)
        ? current.filter((value) => value !== key)
        : [...current, key];
      if (organizationId && branchId)
        window.localStorage.setItem(
          `${preferencePrefix()}:pinned`,
          JSON.stringify(next),
        );
      return next;
    });
    setQuickProductSnapshots((current) => {
      const snapshots = new Map(current.map((row) => [productKey(row), row]));
      snapshots.set(key, product);
      const next = [...snapshots.values()].slice(-60);
      if (organizationId && branchId)
        window.localStorage.setItem(
          `${preferencePrefix()}:products`,
          JSON.stringify(next),
        );
      return next;
    });
  }

  function rememberSoldProducts(lines: CartLine[]) {
    if (!organizationId || !branchId) return;
    setSalesCounts((current) => {
      const next = { ...current };
      for (const line of lines) {
        const key = productKey(line);
        next[key] = (next[key] ?? 0) + Math.max(1, Number(line.quantity) || 1);
      }
      window.localStorage.setItem(
        `${preferencePrefix()}:sales-counts`,
        JSON.stringify(next),
      );
      return next;
    });
    setQuickProductSnapshots((current) => {
      const snapshots = new Map(current.map((row) => [productKey(row), row]));
      for (const line of lines) {
        snapshots.set(productKey(line), line);
      }
      const next = [...snapshots.values()].slice(-60);
      window.localStorage.setItem(
        `${preferencePrefix()}:products`,
        JSON.stringify(next),
      );
      return next;
    });
  }

  function applyKeypad(value: string) {
    if (keypadTarget === "CASH") {
      setCashTender((current) => keypadValue(current, value));
      return;
    }
    const targetKey = selectedCartKey || (cart[0] ? productKey(cart[0]) : "");
    if (!targetKey) return;
    setSelectedCartKey(targetKey);
    setCart((rows) =>
      rows.map((row) =>
        productKey(row) === targetKey
          ? { ...row, quantity: keypadValue(row.quantity, value) }
          : row,
      ),
    );
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
  async function checkout(printPreference?: "PRINT" | "NO_PRINT") {
    if (!organizationId || !cart.length) return;
    setBusy(true);
    setMessage("");
    const soldLines = [...cart];
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
      if (!splitTender && tenderMode === "CASH" && tenderedMinor < total)
        throw new Error("Cash received cannot be less than the sale total.");
      const payment =
        splitTender
          ? [
              { method: "CASH", amountMinor: splitCashMinor },
              { method: "CARD", amountMinor: splitCardMinor, reference: `SPLIT:${localBank}` },
            ]
          : tenderMode === "CASH"
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
              ? { ...appointmentPayload, payments: Array.isArray(payment) ? payment : [payment] }
              : { ...basePayload, payments: Array.isArray(payment) ? payment : [payment] },
          ),
        },
      );
      rememberSoldProducts(soldLines);
      setCompletedSale(sale);
      setPreviousSale(sale);
      setCart([]);
      setCashTender("");
      setSplitCash("");
      setSplitTender(false);
      setTerminalReference("");
      setDiscountType("");
      setDiscountValue("");
      if (printPreference === "PRINT" || (printPreference == null && autoPrint)) {
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
  function toggleCelebrationMode() {
    const next = !celebrationMode;
    setCelebrationMode(next);
    window.localStorage.setItem("allshops-pos-celebration-mode", String(next));
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
  async function logout() {
    await Promise.race([
      api("/auth/logout", { method: "POST" }).catch(() => undefined),
      new Promise((resolve) => window.setTimeout(resolve, 2_000)),
    ]);
    clearSession();
    window.location.assign("/welcome?reason=logout");
  }
  function newSale() {
    setCompletedSale(undefined);
    setPrintJob(undefined);
    setAppointmentId("");
    setCustomerId("");
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }
  function clearTicket() {
    if (!cart.length) return;
    if (!window.confirm("Delete every item from the current ticket?")) return;
    setCart([]);
    setDiscountType("");
    setDiscountValue("");
    setCashTender("");
    setSelectedCartKey("");
    setMessage("Current ticket cleared.");
  }
  function startNewTicket() {
    if (cart.length && !window.confirm("Start a new ticket and clear the current cart?"))
      return;
    setCart([]);
    setCompletedSale(undefined);
    setAppointmentId("");
    setCustomerId("");
    setDiscountType("");
    setDiscountValue("");
    setCashTender("");
    setSelectedCartKey("");
    setMessage("");
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
              <small>Scanner ready · {branches.find((branch) => branch.id === branchId)?.name ?? "Register"}</small>
            </span>
            {branches.length > 1 && (
              <select
                className="pos-branch-selector"
                aria-label="Active branch"
                value={branchId}
                onChange={(event) => changeBranch(event.target.value)}
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="pos-previous-summary" aria-label="Previous transaction summary">
            <span>
              <small>Previous bill</small>
              <strong>
                {previousSale
                  ? formatMinorCurrency(previousSale.totalMinor)
                  : "—"}
              </strong>
            </span>
            <span>
              <small>Previous paid</small>
              <strong>
                {previousSale
                  ? formatMinorCurrency(previousSale.paidMinor)
                  : "—"}
              </strong>
            </span>
            <span>
              <small>Previous balance</small>
              <strong>
                {previousSale
                  ? formatMinorCurrency(previousSale.balanceMinor)
                  : "—"}
              </strong>
            </span>
          </div>
          <div className="pos-user-controls">
          <details className="pos-register-menu pos-user-menu">
            <summary>
              <span className="pos-user-avatar" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M12 12a4.4 4.4 0 1 0 0-8.8 4.4 4.4 0 0 0 0 8.8Zm-8 8.8c.5-4 3.7-6.5 8-6.5s7.5 2.5 8 6.5H4Z" /></svg>
              </span>
              <span>
                <small>Logged-in user</small>
                <strong>{cashierIdentity}</strong>
              </span>
              <span aria-hidden="true">⌄</span>
            </summary>
            <div className="pos-register-menu-panel">
              <div className="pos-user-menu-heading">
                <strong>{currentUser?.name ?? "Cashier"}</strong>
                <small>{branches.find((branch) => branch.id === branchId)?.name ?? "Active register"}</small>
              </div>
              <label className="pos-auto-print">
                <input
                  type="checkbox"
                  checked={autoPrint}
                  onChange={toggleAutoPrint}
                />
                Auto-print receipt
              </label>
              <label className="pos-auto-print">
                <input
                  type="checkbox"
                  checked={celebrationMode}
                  onChange={toggleCelebrationMode}
                />
                Celebration mode
              </label>
              <button
                type="button"
                className="pos-logout-button"
                onClick={() => void logout()}
              >
                <span aria-hidden="true">↪</span> Log out
              </button>
            </div>
          </details>
          <button
            type="button"
            className="pos-focus-toggle"
            onClick={() => void toggleFocusMode()}
            aria-label={focusMode ? "Minimize point of sale" : "Maximize point of sale"}
            title={focusMode ? "Minimize" : "Maximize"}
          >
            <span aria-hidden="true">{focusMode ? "↙" : "↗"}</span>
          </button>
          </div>
        </header>
        <section className="pos-layout">
          <div className="card pos-products">
            <nav className="pos-operations" aria-label="Register operations">
              <Link href="/register-shifts">
                <span aria-hidden="true">▣</span>
                <strong>Cash drawer</strong>
                <small>Open or close shift</small>
              </Link>
              <Link href="/reports">
                <span aria-hidden="true">▥</span>
                <strong>Sales report</strong>
                <small>Today&apos;s performance</small>
              </Link>
              <Link href="/inventory">
                <span aria-hidden="true">▦</span>
                <strong>Stock control</strong>
                <small>Inventory &amp; production</small>
              </Link>
            </nav>
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
                <strong>{query ? "Search results" : "Fast-sale items"}</strong>
                <small>
                  {query
                    ? `${productTotal} products found`
                    : "Most sold first · pinned items stay at the top"}
                </small>
              </span>
              <span className="pos-product-view-controls">
                <button
                  type="button"
                  className={productTileMode === "QUICK" ? "active" : ""}
                  onClick={() => selectTileMode("QUICK")}
                  title="Show fast blue product buttons"
                >
                  Blue tiles
                </button>
                <button
                  type="button"
                  className={productTileMode === "IMAGE" ? "active" : ""}
                  onClick={() => selectTileMode("IMAGE")}
                  title="Show product images and prices"
                >
                  Images
                </button>
                <button
                  type="button"
                  className={customizingQuickItems ? "active" : ""}
                  onClick={() => setCustomizingQuickItems((value) => !value)}
                  title="Choose items that stay in the fast-sale section"
                >
                  {customizingQuickItems ? "Done" : "Choose items"}
                </button>
              </span>
            </div>
            <div
              className={`product-grid ${productTileMode === "QUICK" ? "quick-tile-grid" : "image-tile-grid"}`}
              ref={productGridRef}
            >
              {displayedProducts.map((product) => {
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
                const key = productKey(product);
                const pinned = pinnedProductKeys.includes(key);
                return (
                  <div
                    className={`product-tile-shell ${pinned ? "is-pinned" : ""}`}
                    key={key}
                  >
                    <button
                      className="product-tile"
                      disabled={out}
                      onClick={() =>
                        customizingQuickItems
                          ? togglePinnedProduct(product)
                          : add(product)
                      }
                      title={`${product.name}${identity ? ` — ${identity}` : ""} — ${formatMinorCurrency(product.priceMinor)}`}
                    >
                      {productTileMode === "IMAGE" && (
                        <ProductTileMedia
                          imageUrl={imageUrl}
                          name={product.name}
                          priceLabel={formatMinorCurrency(product.priceMinor)}
                        />
                      )}
                      <div className="product-tile-copy">
                        <strong>{product.name}</strong>
                        <small>{tileSubtitle}</small>
                        {productTileMode === "QUICK" && (
                          <b>{formatMinorCurrency(product.priceMinor)}</b>
                        )}
                      </div>
                    </button>
                    {customizingQuickItems && (
                      <button
                        type="button"
                        className="product-pin-button"
                        onClick={() => togglePinnedProduct(product)}
                        aria-label={`${pinned ? "Unpin" : "Pin"} ${product.name}`}
                        title={pinned ? "Remove from pinned items" : "Pin as a fast-sale item"}
                      >
                        {pinned ? "★" : "☆"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {query && productTotal > pageSize && (
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
            <div className="pos-keypad-workbench">
              <div className="pos-ticket-actions">
                <button type="button" onClick={startNewTicket}>
                  <span>＋</span><strong>New</strong><kbd>F2</kbd>
                </button>
                <button type="button" onClick={clearTicket} disabled={!cart.length}>
                  <span>⌫</span><strong>Delete bill</strong><kbd>F7</kbd>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!previousSale) return;
                    setPrintJob({ saleId: previousSale.id, mode: "reprint", nonce: Date.now() });
                  }}
                  disabled={!previousSale}
                >
                  <span>▤</span><strong>Print</strong><kbd>F11</kbd>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentPanelOpen(true);
                    window.setTimeout(() => paymentRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 0);
                  }}
                >
                  <span>◉</span><strong>Payment</strong><kbd>F9</kbd>
                </button>
                <button type="button" disabled={!canCompleteSale} onClick={() => void checkout("NO_PRINT")}>
                  <span>▣</span><strong>Save</strong><kbd>F12</kbd>
                </button>
                <button type="button" disabled={!canCompleteSale} onClick={() => void checkout("PRINT")}>
                  <span>▣</span><strong>Save &amp; print</strong><kbd>F12</kbd>
                </button>
              </div>
              <div className="pos-number-pad" aria-label="Register number pad">
                {["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "BACKSPACE"].map(
                  (key) => (
                    <button type="button" key={key} onClick={() => applyKeypad(key)}>
                      {key === "BACKSPACE" ? "⌫" : key}
                    </button>
                  ),
                )}
              </div>
              <div className="pos-keypad-modes">
                <button
                  type="button"
                  className={keypadTarget === "QUANTITY" ? "active" : ""}
                  onClick={() => setKeypadTarget("QUANTITY")}
                >
                  Qty
                </button>
                <button
                  type="button"
                  className={keypadTarget === "CASH" ? "active" : ""}
                  onClick={() => {
                    setKeypadTarget("CASH");
                    cashTenderRef.current?.focus();
                  }}
                >
                  Cash
                </button>
                <button type="button" onClick={() => applyKeypad("CLEAR")}>Clear</button>
                <button
                  type="button"
                  className="enter"
                  disabled={!canCompleteSale}
                  onClick={() => void checkout()}
                >
                  Pay <kbd>F12</kbd>
                </button>
              </div>
            </div>
          </div>
          <div className="card pos-cart">
            <div className="pos-cart-header">
              <h2>Current bill</h2>
              <span>
                {cart.length} {cart.length === 1 ? "item" : "items"} · {formatMinorCurrency(total)}
              </span>
            </div>
            <div className="pos-cart-column-headings" aria-hidden="true">
              <span>Item</span><span>Qty</span><span>Amount</span><span />
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
                  className={`cart-line ${selectedCartKey === productKey(line) ? "selected" : ""}`}
                  key={`${line.productId}:${line.variantId ?? "base"}`}
                  onClick={() => {
                    setSelectedCartKey(productKey(line));
                    setKeypadTarget("QUANTITY");
                  }}
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
            <button
              type="button"
              className={`pos-payment-drawer-toggle ${paymentPanelOpen ? "active" : ""}`}
              onClick={() => setPaymentPanelOpen((value) => !value)}
              aria-expanded={paymentPanelOpen}
              aria-controls="pos-payment-panel"
            >
              <span className="pos-payment-drawer-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 4h16V7H4v2Zm2 6h5v2H6v-2Z" /></svg>
              </span>
              <span><strong>Customer &amp; payment</strong><small>{customer?.name ?? "Walk-in customer"} · {tenderMode === "CASH" ? "Cash" : "Local card"}</small></span>
              <b>{formatMinorCurrency(total)}</b>
              <span aria-hidden="true">{paymentPanelOpen ? "⌃" : "⌄"}</span>
            </button>
            <div
              id="pos-payment-panel"
              className={`pos-cart-calculator ${paymentPanelOpen ? "is-open" : ""}`}
              ref={paymentRef}
            >
              {canDiscount && (
                <div className="discount-row">
                  <select
                    aria-label="Discount type"
                    value={discountType}
                    onChange={(event) => setDiscountType(event.target.value)}
                  >
                    <option value="">No discount</option>
                    <option value="FIXED">Fixed KES</option>
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
              <label className="pos-split-toggle">
                <input
                  type="checkbox"
                  checked={splitTender}
                  onChange={(event) => setSplitTender(event.target.checked)}
                />
                Split payment between cash and local card
              </label>
              {splitTender && (
                <div className="cash-panel split-payment-panel">
                  <label>
                    Cash portion (KES)
                    <input
                      type="number"
                      min="0.01"
                      max={(total / 100 - 0.01).toFixed(2)}
                      step="0.01"
                      value={splitCash}
                      onChange={(event) => setSplitCash(event.target.value)}
                    />
                  </label>
                  <div className="cash-change">
                    <span>Local card portion</span>
                    <strong>{formatMinorCurrency(splitCardMinor)}</strong>
                  </div>
                </div>
              )}
              {tenderMode === "CASH" && (
                <div className="cash-panel">
                <label>
                  Cash received (KES)
                  <input
                    ref={cashTenderRef}
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
                        : `KES ${value.toFixed(2)}`}
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
                    <option>KCB</option>
                    <option>Equity Bank</option>
                    <option>Co-operative Bank</option>
                    <option>NCBA</option>
                    <option>Absa Kenya</option>
                    <option>Stanbic Bank</option>
                    <option>I&amp;M Bank</option>
                    <option>Mobile money / bank terminal</option>
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
            <div className="totals pos-bottom-totals">
              <span>Subtotal <b>{formatMinorCurrency(subtotal)}</b></span>
              <span>Discount <b>− {formatMinorCurrency(discount)}</b></span>
              <span>Tax <b>{formatMinorCurrency(0)}</b></span>
              <strong>Total <b>{formatMinorCurrency(total)}</b></strong>
            </div>
            <div className="actions pos-icon-sale-actions">
              <button
                className="secondary"
                disabled={busy || !cart.length}
                onClick={() => void hold()}
                aria-label="Hold sale"
                title="Hold sale (F8)"
              >
                <span aria-hidden="true">Ⅱ</span>
              </button>
              <button
                disabled={!canCompleteSale}
                onClick={() => void checkout()}
                aria-label={tenderMode === "CASH" ? "Complete cash sale" : "Complete local card sale"}
                title={tenderMode === "CASH" ? "Complete cash sale (F12)" : "Complete local card sale (F12)"}
              >
                <span aria-hidden="true">{busy ? "…" : "✓"}</span>
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
          {celebrationMode && (
            <div className="celebration-sparkles" aria-hidden="true">
              <i>✦</i><i>✦</i><i>✦</i><i>✦</i><i>✦</i><i>✦</i>
            </div>
          )}
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
              <button onClick={newSale} autoFocus>
                New sale <span className="button-shortcut">↵ Enter</span>
              </button>
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
  priceLabel,
}: {
  imageUrl: string | null;
  name: string;
  priceLabel: string;
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
      <span className="product-tile-price">{priceLabel}</span>
    </div>
  );
}

function keypadValue(current: string, key: string) {
  if (key === "CLEAR") return "";
  if (key === "BACKSPACE") return current.slice(0, -1);
  if (key === "." && current.includes(".")) return current;
  if (key === "." && !current) return "0.";
  const next = `${current}${key}`.replace(/^0+(?=\d)/, "");
  const [whole = "", decimals] = next.split(".");
  if (decimals && decimals.length > 2) return current;
  return whole.length > 7 ? current : next;
}
