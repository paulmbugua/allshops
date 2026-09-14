"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AppShell } from "../../../components/app-shell";
import { api, selectedOrganization } from "../../../lib/api";
import {
  idempotencyKey,
  type Branch,
  type InventoryRow,
  type Location,
  type Paged,
  type Product,
} from "../../../lib/catalogue";
export default function AdjustmentPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState<InventoryRow[]>([]);
  const [branchId, setBranchId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [operation, setOperation] = useState("OUT");
  const [quantity, setQuantity] = useState("");
  const [message, setMessage] = useState("");
  const organizationId = selectedOrganization();
  useEffect(() => {
    if (!organizationId) return;
    void Promise.all([
      api<Branch[]>(`/organizations/${organizationId}/branches`),
      api<Location[]>(`/organizations/${organizationId}/stock-locations`),
      api<Paged<Product>>(
        `/organizations/${organizationId}/products?trackInventory=true&isActive=true&pageSize=100`,
      ),
      api<Paged<InventoryRow>>(
        `/organizations/${organizationId}/inventory?pageSize=100`,
      ),
    ])
      .then(([branchRows, locationRows, productRows, balanceRows]) => {
        setBranches(branchRows);
        setLocations(locationRows);
        setProducts(productRows.items);
        setBalances(balanceRows.items);
        setBranchId(branchRows[0]?.id ?? "");
        setLocationId(locationRows[0]?.id ?? "");
      })
      .catch((error) =>
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to load inventory options.",
        ),
      );
  }, [organizationId]);
  const current = useMemo(
    () =>
      balances.find(
        (row) =>
          row.location.id === locationId &&
          row.product.id === productId &&
          (row.variant?.id ?? "") === variantId,
      )?.quantity ?? "0",
    [balances, locationId, productId, variantId],
  );
  const resulting =
    quantity && /^\d+(\.\d+)?$/.test(quantity)
      ? (Number(current) + Number(quantity) * (operation === "OUT" ? -1 : 1))
          .toFixed(4)
          .replace(/\.0+$/, "")
      : current;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const data = new FormData(event.currentTarget);
    const opening = operation === "OPENING";
    const body = {
      branchId,
      locationId,
      productId,
      variantId: variantId || null,
      quantity,
      ...(opening
        ? { unitCostMinor: null, reason: data.get("reason") || undefined }
        : { direction: operation, reason: data.get("reason") }),
    };
    try {
      await api(
        `/organizations/${organizationId}/inventory/${opening ? "opening-stock" : "adjustments"}`,
        {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey() },
          body: JSON.stringify(body),
        },
      );
      setMessage("Stock movement posted.");
      const refreshed = await api<Paged<InventoryRow>>(
        `/organizations/${organizationId}/inventory?pageSize=100`,
      );
      setBalances(refreshed.items);
      setQuantity("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to post stock.",
      );
    }
  }
  const chosen = products.find((product) => product.id === productId);
  return (
    <AppShell title="Post stock movement">
      <section className="card">
        <form className="form" onSubmit={submit}>
          <div className="form-grid">
            <label>
              Branch
              <select
                value={branchId}
                onChange={(event) => {
                  const value = event.target.value;
                  setBranchId(value);
                  setLocationId(
                    locations.find((location) => location.branchId === value)
                      ?.id ?? "",
                  );
                }}
                required
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Location
              <select
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
                required
              >
                {locations
                  .filter((location) => location.branchId === branchId)
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Product
              <select
                value={productId}
                onChange={(event) => {
                  setProductId(event.target.value);
                  setVariantId("");
                }}
                required
              >
                <option value="">Choose product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} · {product.sku ?? "No SKU"}
                  </option>
                ))}
              </select>
            </label>
            {chosen?.variants && chosen.variants.length > 0 && (
              <label>
                Variant
                <select
                  value={variantId}
                  onChange={(event) => setVariantId(event.target.value)}
                >
                  <option value="">Base product</option>
                  {chosen.variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Movement
              <select
                value={operation}
                onChange={(event) => setOperation(event.target.value)}
              >
                <option value="OPENING">Opening stock</option>
                <option value="IN">Adjustment in</option>
                <option value="OUT">Adjustment out</option>
              </select>
            </label>
            <label>
              Quantity
              <input
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                inputMode="decimal"
                pattern="\d+(\.\d{1,4})?"
                required
              />
            </label>
            <label>
              Reason
              <input name="reason" required={operation !== "OPENING"} />
            </label>
          </div>
          <div className="calculation">
            <span>
              Current stock <strong>{current}</strong>
            </span>
            <span>
              Resulting stock <strong>{resulting}</strong>
            </span>
          </div>
          <button>Confirm movement</button>
        </form>
        {message && <p className="notice">{message}</p>}
      </section>
    </AppShell>
  );
}
