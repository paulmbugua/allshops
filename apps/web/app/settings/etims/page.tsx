"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../../components/app-shell";
import { api, selectedOrganization, type CurrentUser } from "../../lib/api";

interface Branch {
  id: string;
  name: string;
  code: string;
}
interface Mapping {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  etimsMapping: {
    itemCode: string;
    itemClassCode: string;
    taxTypeCode: string;
    taxRateBps: number;
    packageUnitCode: string;
    quantityUnitCode: string;
    isActive: boolean;
  } | null;
}
interface Overview {
  integration: null | {
    environment: "SANDBOX" | "PRODUCTION";
    status: "DISABLED" | "DRAFT" | "SANDBOX" | "CERTIFIED" | "SUSPENDED";
    kraPin: string;
    traderSystemName: string;
    communicationKeyConfigured: boolean;
    lastSuccessfulSubmissionAt: string | null;
    lastFailureMessage: string | null;
    branches: Array<{
      branchId: string;
      kraBranchId: string;
      deviceSerial: string;
      isActive: boolean;
      initializedAt: string | null;
    }>;
  };
  readiness: {
    products: number;
    mappedProducts: number;
    unmappedProducts: number;
    configuredBranches: number;
    initializedBranches: number;
    pendingDocuments: number;
    rejectedDocuments: number;
  };
}
interface FiscalDocument {
  id: string;
  traderInvoiceNumber: string;
  type: "SALE" | "CREDIT_NOTE";
  status: string;
  environment: string;
  currentReceiptNumber: string | null;
  errorMessage: string | null;
  createdAt: string;
  branch: { name: string };
  outbox: {
    attemptCount: number;
    nextAttemptAt: string;
    lastError: string | null;
  } | null;
}

const taxRates: Record<string, number> = { A: 0, B: 1600, C: 0, D: 0, E: 800 };

export default function EtimsSettingsPage() {
  const organizationId = selectedOrganization();
  const [overview, setOverview] = useState<Overview>();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Mapping[]>([]);
  const [documents, setDocuments] = useState<FiscalDocument[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) return;
    try {
      const [nextOverview, nextBranches, nextProducts, nextDocuments, me] =
        await Promise.all([
          api<Overview>(`/organizations/${organizationId}/etims`),
          api<Branch[]>(`/organizations/${organizationId}/branches`),
          api<Mapping[]>(`/organizations/${organizationId}/etims/products`),
          api<{ items: FiscalDocument[] }>(
            `/organizations/${organizationId}/etims/documents?page=1&pageSize=25`,
          ),
          api<CurrentUser>("/auth/me"),
        ]);
      setOverview(nextOverview);
      setBranches(nextBranches);
      setProducts(nextProducts);
      setDocuments(nextDocuments.items);
      setPermissions(
        me.memberships.find((item) => item.organizationId === organizationId)
          ?.permissions ?? [],
      );
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Unable to load eTIMS settings.",
      );
    }
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) window.location.assign("/onboarding");
    else void load();
  }, [load, organizationId]);

  async function saveConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const data = new FormData(event.currentTarget);
    try {
      await api(`/organizations/${organizationId}/etims/configuration`, {
        method: "PUT",
        body: JSON.stringify({
          kraPin: data.get("kraPin"),
          traderSystemName: data.get("traderSystemName"),
          environment: data.get("environment"),
          status: data.get("status"),
          ...(data.get("communicationKey")
            ? { communicationKey: data.get("communicationKey") }
            : {}),
        }),
      });
      setMessage(
        "eTIMS configuration saved. The communication key is encrypted.",
      );
      event.currentTarget.reset();
      await load();
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Unable to save eTIMS configuration.",
      );
    }
  }

  async function saveBranch(
    event: FormEvent<HTMLFormElement>,
    branchId: string,
  ) {
    event.preventDefault();
    if (!organizationId) return;
    const data = new FormData(event.currentTarget);
    try {
      await api(`/organizations/${organizationId}/etims/branches`, {
        method: "PUT",
        body: JSON.stringify({
          branchId,
          kraBranchId: data.get("kraBranchId"),
          deviceSerial: data.get("deviceSerial"),
          isActive: true,
          initializedAt:
            data.get("initialized") === "on" ? new Date().toISOString() : null,
        }),
      });
      setMessage("KRA branch settings saved.");
      await load();
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Unable to save branch mapping.",
      );
    }
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const data = new FormData(event.currentTarget);
    const taxTypeCode = String(data.get("taxTypeCode"));
    try {
      await api(`/organizations/${organizationId}/etims/products`, {
        method: "PUT",
        body: JSON.stringify({
          productId: data.get("productId"),
          itemCode: data.get("itemCode"),
          itemClassCode: data.get("itemClassCode"),
          itemTypeCode: "2",
          taxTypeCode,
          taxRateBps: taxRates[taxTypeCode] ?? 0,
          originNationCode: "KE",
          packageUnitCode: data.get("packageUnitCode"),
          quantityUnitCode: data.get("quantityUnitCode"),
          isActive: true,
        }),
      });
      setMessage("Product tax and KRA classification saved.");
      event.currentTarget.reset();
      await load();
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : "Unable to map product.",
      );
    }
  }

  async function retry(documentId: string) {
    if (!organizationId) return;
    try {
      await api(
        `/organizations/${organizationId}/etims/documents/${documentId}/retry`,
        {
          method: "POST",
          body: JSON.stringify({
            reason:
              "Administrator requested retry after reviewing the configuration.",
          }),
        },
      );
      setMessage("Fiscal document returned to the delivery queue.");
      await load();
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Unable to retry fiscal document.",
      );
    }
  }

  const canManage = permissions.includes("etims.manage");
  const canRetry = permissions.includes("etims.retry");
  const configured = new Map(
    overview?.integration?.branches.map((row) => [row.branchId, row]) ?? [],
  );

  return (
    <AppShell title="KRA eTIMS">
      {!overview ? (
        <section className="card">
          <p>{message || "Loading eTIMS readiness…"}</p>
        </section>
      ) : (
        <div className="etims-page">
          <section className="etims-hero">
            <div>
              <span className="eyebrow">Kenya fiscal invoicing</span>
              <h2>AllShops runs the business. eTIMS fiscalizes the invoice.</h2>
              <p>
                Sales remain operationally durable while KRA acceptance is
                tracked separately. Only accepted documents display KRA receipt
                credentials.
              </p>
            </div>
            <span
              className={`pill ${overview.integration?.status === "CERTIFIED" ? "active" : "warning"}`}
            >
              {overview.integration?.status ?? "NOT CONFIGURED"}
            </span>
          </section>

          <section className="etims-metrics">
            <article>
              <strong>
                {overview.readiness.mappedProducts}/
                {overview.readiness.products}
              </strong>
              <span>Products mapped</span>
            </article>
            <article>
              <strong>{overview.readiness.initializedBranches}</strong>
              <span>Branches initialized</span>
            </article>
            <article>
              <strong>{overview.readiness.pendingDocuments}</strong>
              <span>Pending submission</span>
            </article>
            <article>
              <strong>{overview.readiness.rejectedDocuments}</strong>
              <span>Needs attention</span>
            </article>
          </section>

          {canManage && (
            <section className="card">
              <h2>1. Integration identity</h2>
              <p className="muted">
                Begin in Draft, configure branches and products, then enable
                Sandbox. Use Certified only after KRA production approval.
              </p>
              <form className="form" onSubmit={saveConfiguration}>
                <div className="form-grid">
                  <label>
                    KRA PIN
                    <input
                      name="kraPin"
                      defaultValue={overview.integration?.kraPin ?? ""}
                      required
                      pattern="[A-Za-z][0-9]{9}[A-Za-z]"
                    />
                  </label>
                  <label>
                    Trader system name
                    <input
                      name="traderSystemName"
                      defaultValue={
                        overview.integration?.traderSystemName ??
                        "AllShops POS + ERP"
                      }
                      required
                    />
                  </label>
                  <label>
                    Environment
                    <select
                      name="environment"
                      defaultValue={
                        overview.integration?.environment ?? "SANDBOX"
                      }
                    >
                      <option>SANDBOX</option>
                      <option>PRODUCTION</option>
                    </select>
                  </label>
                  <label>
                    Submission status
                    <select
                      name="status"
                      defaultValue={overview.integration?.status ?? "DRAFT"}
                    >
                      <option>DISABLED</option>
                      <option>DRAFT</option>
                      <option>SANDBOX</option>
                      <option>CERTIFIED</option>
                      <option>SUSPENDED</option>
                    </select>
                  </label>
                  <label>
                    Communication key
                    <input
                      name="communicationKey"
                      type="password"
                      autoComplete="new-password"
                      placeholder={
                        overview.integration?.communicationKeyConfigured
                          ? "Configured — enter only to rotate"
                          : "KRA-issued key"
                      }
                    />
                  </label>
                </div>
                <button>Save secure configuration</button>
              </form>
            </section>
          )}

          {canManage && overview.integration && (
            <section className="card">
              <h2>2. Branch devices</h2>
              <p className="muted">
                Mark initialized only after KRA has approved and initialized the
                corresponding device.
              </p>
              <div className="etims-branch-grid">
                {branches.map((branch) => {
                  const value = configured.get(branch.id);
                  return (
                    <form
                      className="form compact"
                      key={branch.id}
                      onSubmit={(event) => void saveBranch(event, branch.id)}
                    >
                      <strong>
                        {branch.name} · {branch.code}
                      </strong>
                      <label>
                        KRA branch ID
                        <input
                          name="kraBranchId"
                          defaultValue={value?.kraBranchId ?? "00"}
                          required
                          pattern="[0-9]{2}"
                          maxLength={2}
                        />
                      </label>
                      <label>
                        Device serial
                        <input
                          name="deviceSerial"
                          defaultValue={value?.deviceSerial ?? ""}
                          required
                        />
                      </label>
                      <label className="inline-check">
                        <input
                          name="initialized"
                          type="checkbox"
                          defaultChecked={Boolean(value?.initializedAt)}
                        />{" "}
                        KRA device initialization confirmed
                      </label>
                      <button>Save branch</button>
                    </form>
                  );
                })}
              </div>
            </section>
          )}

          {canManage && overview.integration && (
            <section className="card">
              <h2>3. Product classification and tax</h2>
              <p className="muted">
                Checkout is blocked for unmapped items once Sandbox or Certified
                submission is enabled.
              </p>
              <form className="form" onSubmit={saveProduct}>
                <div className="form-grid">
                  <label>
                    Product
                    <select name="productId" required>
                      <option value="">Select product</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                          {product.etimsMapping ? " ✓" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    KRA item code
                    <input name="itemCode" required maxLength={20} />
                  </label>
                  <label>
                    10-digit classification
                    <input
                      name="itemClassCode"
                      required
                      pattern="[0-9]{10}"
                      maxLength={10}
                    />
                  </label>
                  <label>
                    Tax category
                    <select name="taxTypeCode" defaultValue="B">
                      <option value="B">B · Standard VAT 16%</option>
                      <option value="E">E · Special rate 8%</option>
                      <option value="A">A · Exempt 0%</option>
                      <option value="C">C · Zero-rated 0%</option>
                      <option value="D">D · Non-VAT 0%</option>
                    </select>
                  </label>
                  <label>
                    Package unit
                    <input name="packageUnitCode" defaultValue="NT" required />
                  </label>
                  <label>
                    Quantity unit
                    <input name="quantityUnitCode" defaultValue="U" required />
                  </label>
                </div>
                <button>Save product mapping</button>
              </form>
              <div className="table-list etims-products">
                {products.map((product) => (
                  <div className="table-row" key={product.id}>
                    <div>
                      <strong>{product.name}</strong>
                      <small>
                        {product.sku || product.barcode || "No product code"}
                      </small>
                    </div>
                    <span
                      className={`pill ${product.etimsMapping ? "active" : "warning"}`}
                    >
                      {product.etimsMapping
                        ? `${product.etimsMapping.taxTypeCode} · ${product.etimsMapping.itemClassCode}`
                        : "Unmapped"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card">
            <h2>Fiscal delivery monitor</h2>
            <div className="table-list">
              {documents.length === 0 && (
                <p className="muted">No fiscal documents yet.</p>
              )}
              {documents.map((document) => (
                <div className="table-row" key={document.id}>
                  <div>
                    <strong>{document.traderInvoiceNumber}</strong>
                    <small>
                      {document.branch.name} · {document.type.replace("_", " ")}{" "}
                      · {new Date(document.createdAt).toLocaleString("en-KE")}
                    </small>
                    {document.errorMessage && (
                      <small className="error-text">
                        {document.errorMessage}
                      </small>
                    )}
                  </div>
                  <span
                    className={`pill ${document.status === "ACCEPTED" ? "active" : document.status === "REJECTED" ? "warning" : ""}`}
                  >
                    {document.status}
                    {document.currentReceiptNumber
                      ? ` · KRA #${document.currentReceiptNumber}`
                      : ""}
                  </span>
                  {canRetry &&
                    ["REJECTED", "RETRY"].includes(document.status) && (
                      <button
                        className="secondary"
                        onClick={() => void retry(document.id)}
                      >
                        Retry
                      </button>
                    )}
                </div>
              ))}
            </div>
          </section>
          {message && <p className="status-banner">{message}</p>}
        </div>
      )}
    </AppShell>
  );
}
