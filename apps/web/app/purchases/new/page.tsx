"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AppShell } from "../../components/app-shell";
import { api, selectedOrganization } from "../../lib/api";
import { formatMinorCurrency } from "../../lib/catalogue";
import {
  moneyInputToMinor,
  today,
  type Branch,
  type Paged,
  type Product,
  type Purchase,
  type Supplier,
} from "../../lib/phase4";

interface Line {
  selection: string;
  quantity: string;
  cost: string;
  discount: string;
  tax: string;
}
const blank = (): Line => ({
  selection: "",
  quantity: "1",
  cost: "0",
  discount: "0",
  tax: "0",
});
export default function NewPurchasePage() {
  const organizationId = selectedOrganization();
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!organizationId) return;
    void Promise.all([
      api<Paged<Supplier>>(
        `/organizations/${organizationId}/suppliers?pageSize=100&isActive=true`,
      ),
      api<Branch[]>(`/organizations/${organizationId}/branches`),
      api<Paged<Product>>(
        `/organizations/${organizationId}/products?pageSize=100&isActive=true`,
      ),
    ])
      .then(([s, b, p]) => {
        setSuppliers(s.items);
        setBranches(b);
        setProducts(p.items);
      })
      .catch((error) => setMessage(error.message));
  }, [organizationId]);
  const subtotal = useMemo(
    () =>
      lines.reduce(
        (sum, row) =>
          sum +
          Math.round(Number(row.quantity || 0) * moneyInputToMinor(row.cost)) -
          moneyInputToMinor(row.discount) +
          moneyInputToMinor(row.tax),
        0,
      ),
    [lines],
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const form = new FormData(event.currentTarget);
    try {
      const purchase = await api<Purchase>(
        `/organizations/${organizationId}/purchases`,
        {
          method: "POST",
          body: JSON.stringify({
            branchId: form.get("branchId"),
            supplierId: form.get("supplierId"),
            supplierInvoiceNumber: String(form.get("invoice") ?? "") || null,
            purchaseDate: form.get("purchaseDate"),
            expectedDate: String(form.get("expectedDate") ?? "") || null,
            notes: String(form.get("notes") ?? "") || null,
            discountMinor: moneyInputToMinor(
              String(form.get("discount") ?? "0"),
            ),
            items: lines.map((row) => {
              const [productId, variantId] = row.selection.split("|");
              return {
                productId,
                variantId: variantId || null,
                quantity: row.quantity,
                unitCostMinor: moneyInputToMinor(row.cost),
                discountMinor: moneyInputToMinor(row.discount),
                taxMinor: moneyInputToMinor(row.tax),
              };
            }),
          }),
        },
      );
      router.push(`/purchases/${purchase.id}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create purchase.",
      );
    }
  }
  return (
    <AppShell title="New purchase">
      <section className="card">
        <form className="form" onSubmit={submit}>
          <div className="form-grid">
            <label>
              Supplier
              <select name="supplierId" required>
                <option value="">Select supplier</option>
                {suppliers.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Branch
              <select name="branchId" required>
                <option value="">Select branch</option>
                {branches.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Purchase date
              <input
                name="purchaseDate"
                type="date"
                defaultValue={today()}
                required
              />
            </label>
            <label>
              Expected date
              <input name="expectedDate" type="date" />
            </label>
            <label>
              Supplier invoice
              <input name="invoice" />
            </label>
            <label>
              Header discount QAR
              <input
                name="discount"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
              />
            </label>
          </div>
          <h2>Items</h2>
          {lines.map((line, index) => (
            <div className="form-grid transfer-item" key={index}>
              <label>
                Product / variant
                <select
                  required
                  value={line.selection}
                  onChange={(event) =>
                    setLines((rows) =>
                      rows.map((row, i) =>
                        i === index
                          ? { ...row, selection: event.target.value }
                          : row,
                      ),
                    )
                  }
                >
                  <option value="">Select</option>
                  {products.flatMap((product) => [
                    <option key={product.id} value={`${product.id}|`}>
                      {product.name}
                    </option>,
                    ...(product.variants ?? []).map((variant) => (
                      <option
                        key={variant.id}
                        value={`${product.id}|${variant.id}`}
                      >
                        {product.name} · {variant.name}
                      </option>
                    )),
                  ])}
                </select>
              </label>
              <label>
                Quantity
                <input
                  required
                  value={line.quantity}
                  onChange={(event) =>
                    setLines((rows) =>
                      rows.map((row, i) =>
                        i === index
                          ? { ...row, quantity: event.target.value }
                          : row,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Unit cost QAR
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.cost}
                  onChange={(event) =>
                    setLines((rows) =>
                      rows.map((row, i) =>
                        i === index
                          ? { ...row, cost: event.target.value }
                          : row,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Discount QAR
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.discount}
                  onChange={(event) =>
                    setLines((rows) =>
                      rows.map((row, i) =>
                        i === index
                          ? { ...row, discount: event.target.value }
                          : row,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Tax QAR
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.tax}
                  onChange={(event) =>
                    setLines((rows) =>
                      rows.map((row, i) =>
                        i === index ? { ...row, tax: event.target.value } : row,
                      ),
                    )
                  }
                />
              </label>
              {lines.length > 1 && (
                <button
                  type="button"
                  className="danger"
                  onClick={() =>
                    setLines((rows) => rows.filter((_, i) => i !== index))
                  }
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <div className="calculation">
            <button
              type="button"
              className="secondary"
              onClick={() => setLines((rows) => [...rows, blank()])}
            >
              Add item
            </button>
            <strong>Lines estimate {formatMinorCurrency(subtotal)}</strong>
          </div>
          <label>
            Notes
            <textarea name="notes" />
          </label>
          {message && <p className="error">{message}</p>}
          <button>Create draft purchase</button>
        </form>
      </section>
    </AppShell>
  );
}
