"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../components/app-shell";
import { Can } from "../components/permission-context";
import { api, apiText, selectedOrganization } from "../lib/api";
import {
  formatMinorCurrency,
  type Paged,
  type Product,
} from "../lib/catalogue";
export default function ProductsPage() {
  const [result, setResult] = useState<Paged<Product>>({
    items: [],
    page: 1,
    pageSize: 25,
    total: 0,
  });
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [message, setMessage] = useState("");
  const [csv, setCsv] = useState("");
  const [importing, setImporting] = useState(false);
  const organizationId = selectedOrganization();
  useEffect(() => {
    if (!organizationId) {
      window.location.assign("/onboarding");
      return;
    }
    void load(1);
  }, [organizationId]);
  async function load(page: number) {
    if (!organizationId) return;
    try {
      setResult(
        await api<Paged<Product>>(
          `/organizations/${organizationId}/products?page=${page}&pageSize=25&search=${encodeURIComponent(query)}${type ? `&type=${type}` : ""}`,
        ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load products.",
      );
    }
  }
  function search(event: FormEvent) {
    event.preventDefault();
    void load(1);
  }
  async function exportCsv() {
    if (!organizationId) return;
    const value = await apiText(`/organizations/${organizationId}/products/export`);
    const url = URL.createObjectURL(new Blob([value], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "allshops-catalogue.csv"; anchor.click(); URL.revokeObjectURL(url);
  }
  async function importCsv(dryRun: boolean) {
    if (!organizationId || !csv.trim()) return;
    setImporting(true);
    try { const result = await api<{ imported: number; validRows: number; errors: Array<{ row: number; message: string }> }>(`/organizations/${organizationId}/products/import`, { method: "POST", body: JSON.stringify({ csv, dryRun }) }); setMessage(`${dryRun ? "Validation complete" : `Imported ${result.imported} products`}. ${result.validRows} valid rows, ${result.errors.length} errors${result.errors.length ? `: ${result.errors[0]?.message ?? "invalid row"}` : "."}`); if (!dryRun) { setCsv(""); await load(1); } } catch (error) { setMessage(error instanceof Error ? error.message : "Catalogue import failed."); } finally { setImporting(false); }
  }
  return (
    <AppShell title="Products">
      <section className="card">
        <div className="toolbar">
          <form onSubmit={search}>
            <input
              aria-label="Search products"
              placeholder="Search name, SKU or barcode"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              aria-label="Product type"
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="">All types</option>
              <option value="STOCK_ITEM">Stock items</option>
              <option value="SERVICE">Services</option>
              <option value="NON_STOCK_ITEM">Non-stock</option>
            </select>
            <button>Search</button>
          </form>
          <Can permissions={["product.create"]}>
            <Link className="button-link" href="/products/new">
              New product
            </Link>
          </Can>
          <Can permissions={["catalogue.export"]}><button className="secondary" onClick={() => void exportCsv()}>Export CSV</button></Can>
        </div>
        <Can permissions={["catalogue.import"]}><details className="card compact"><summary>Import catalogue CSV</summary><p className="muted">Export first to get the exact headers. Validate before committing; formula-like cells are neutralized on export.</p><textarea rows={5} value={csv} onChange={(event) => setCsv(event.target.value)} placeholder="Paste CSV here" /><div className="toolbar"><button className="secondary" disabled={importing || !csv.trim()} onClick={() => void importCsv(true)}>Validate</button><button disabled={importing || !csv.trim()} onClick={() => void importCsv(false)}>Import valid CSV</button></div></details></Can>
        <div className="data-table product-table">
          <strong>Product</strong>
          <strong>SKU / Barcode</strong>
          <strong>Category</strong>
          <strong>Type</strong>
          <strong>Cost</strong>
          <strong>Price</strong>
          <strong>Stock</strong>
          <strong>Status</strong>
          {result.items.map((item) => (
            <div className="data-row" key={item.id}>
              <Link href={`/products/${item.id}`}>
                <strong>{item.name}</strong>
              </Link>
              <span>
                {item.sku ?? "—"}
                <small>{item.barcode ?? ""}</small>
              </span>
              <span>{item.category?.name ?? "—"}</span>
              <span>{item.type.replaceAll("_", " ")}</span>
              <span>
                {item.costMinor === undefined
                  ? "Restricted"
                  : formatMinorCurrency(item.costMinor)}
              </span>
              <span>{formatMinorCurrency(item.priceMinor)}</span>
              <span>{item.stock ?? "0"}</span>
              <span className={`pill ${item.isActive ? "active" : ""}`}>
                {item.isActive ? "Active" : "Inactive"}
              </span>
            </div>
          ))}
        </div>
        <div className="pager">
          <button
            className="secondary"
            disabled={result.page <= 1}
            onClick={() => void load(result.page - 1)}
          >
            Previous
          </button>
          <span>
            Page {result.page} · {result.total} products
          </span>
          <button
            className="secondary"
            disabled={result.page * result.pageSize >= result.total}
            onClick={() => void load(result.page + 1)}
          >
            Next
          </button>
        </div>
        {message && <p className="notice">{message}</p>}
      </section>
    </AppShell>
  );
}
