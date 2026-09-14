"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../components/app-shell";
import { api, selectedOrganization } from "../../../lib/api";
import {
  idempotencyKey,
  type Branch,
  type Location,
  type Paged,
  type Product,
} from "../../../lib/catalogue";
export default function NewTransferPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [rows, setRows] = useState([0]);
  const [message, setMessage] = useState("");
  const organizationId = selectedOrganization();
  const router = useRouter();
  useEffect(() => {
    if (!organizationId) return;
    void Promise.all([
      api<Branch[]>(`/organizations/${organizationId}/branches`),
      api<Location[]>(`/organizations/${organizationId}/stock-locations`),
      api<Paged<Product>>(
        `/organizations/${organizationId}/products?trackInventory=true&isActive=true&pageSize=100`,
      ),
    ])
      .then(([branchRows, locationRows, productRows]) => {
        setBranches(branchRows);
        setLocations(locationRows);
        setProducts(productRows.items);
      })
      .catch((error) =>
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to load transfer options.",
        ),
      );
  }, [organizationId]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const data = new FormData(event.currentTarget);
    const productIds = data.getAll("productId").map(String);
    const quantities = data.getAll("quantity").map(String);
    try {
      const transfer = await api<{ id: string }>(
        `/organizations/${organizationId}/inventory/transfers`,
        {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey() },
          body: JSON.stringify({
            fromBranchId: data.get("fromBranchId"),
            fromLocationId: data.get("fromLocationId"),
            toBranchId: data.get("toBranchId"),
            toLocationId: data.get("toLocationId"),
            notes: data.get("notes") || null,
            items: productIds.map((productId, index) => ({
              productId,
              quantity: quantities[index],
            })),
          }),
        },
      );
      router.push(`/inventory/transfers/${transfer.id}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create transfer.",
      );
    }
  }
  return (
    <AppShell title="New stock transfer">
      <section className="card">
        <form className="form" onSubmit={submit}>
          <h2>Route</h2>
          <div className="form-grid">
            <label>
              From branch
              <select name="fromBranchId" required>
                <option value="">Choose branch</option>
                {branches.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              From location
              <select name="fromLocationId" required>
                <option value="">Choose location</option>
                {locations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.branch.name} · {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              To branch
              <select name="toBranchId" required>
                <option value="">Choose branch</option>
                {branches.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              To location
              <select name="toLocationId" required>
                <option value="">Choose location</option>
                {locations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.branch.name} · {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <h2>Items</h2>
          {rows.map((row, index) => (
            <div className="form-grid transfer-item" key={row}>
              <label>
                Product
                <select name="productId" required>
                  <option value="">Choose product</option>
                  {products.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.sku ?? "No SKU"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantity
                <input
                  name="quantity"
                  inputMode="decimal"
                  pattern="\d+(\.\d{1,4})?"
                  required
                />
              </label>
              {rows.length > 1 && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    setRows((current) =>
                      current.filter((_, rowIndex) => rowIndex !== index),
                    )
                  }
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="secondary"
            onClick={() =>
              setRows((current) => [...current, Math.max(...current) + 1])
            }
          >
            Add product
          </button>
          <label>
            Notes
            <textarea name="notes" />
          </label>
          <button>Save draft</button>
        </form>
        {message && <p className="notice">{message}</p>}
      </section>
    </AppShell>
  );
}
