"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../components/app-shell";
import { Can } from "../components/permission-context";
import { api, selectedOrganization } from "../lib/api";
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
        </div>
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
