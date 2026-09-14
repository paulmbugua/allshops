"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  decimalCurrencyToMinor,
  type Brand,
  type Category,
  type Paged,
  type Product,
  type Unit,
} from "../lib/catalogue";
import { api, selectedOrganization } from "../lib/api";

export function ProductForm({
  initial,
  onSaved,
}: {
  initial?: Product;
  onSaved: (product: Product) => void;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [type, setType] = useState(initial?.type ?? "STOCK_ITEM");
  const [tracking, setTracking] = useState(initial?.trackInventory ?? true);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const organizationId = selectedOrganization();
  useEffect(() => {
    if (!organizationId) return;
    void Promise.all([
      api<Paged<Category>>(
        `/organizations/${organizationId}/categories?isActive=true&pageSize=100`,
      ),
      api<Paged<Brand>>(
        `/organizations/${organizationId}/brands?isActive=true&pageSize=100`,
      ),
      api<Paged<Unit>>(
        `/organizations/${organizationId}/units?isActive=true&pageSize=100`,
      ),
    ])
      .then(([categoryResult, brandResult, unitResult]) => {
        setCategories(categoryResult.items);
        setBrands(brandResult.items);
        setUnits(unitResult.items);
      })
      .catch((error) =>
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to load catalogue options.",
        ),
      );
  }, [organizationId]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setMessage("");
    try {
      const body = {
        name: data.get("name"),
        arabicName: data.get("arabicName") || null,
        description: data.get("description") || null,
        type,
        categoryId: data.get("categoryId") || null,
        brandId: data.get("brandId") || null,
        unitId: data.get("unitId"),
        sku: data.get("sku") || null,
        barcode: data.get("barcode") || null,
        costMinor: decimalCurrencyToMinor(String(data.get("cost"))),
        priceMinor: decimalCurrencyToMinor(String(data.get("price"))),
        trackInventory: tracking,
        allowNegativeStock: data.get("allowNegativeStock") === "on",
        minimumStock:
          tracking && data.get("minimumStock")
            ? data.get("minimumStock")
            : null,
        imageUrl: data.get("imageUrl") || null,
        isActive: data.get("isActive") === "on",
      };
      const product = await api<Product>(
        `/organizations/${organizationId}/products${initial ? `/${initial.id}` : ""}`,
        { method: initial ? "PATCH" : "POST", body: JSON.stringify(body) },
      );
      setMessage("Product saved.");
      onSaved(product);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to save product.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        <label>
          Name
          <input name="name" defaultValue={initial?.name} required />
        </label>
        <label>
          Arabic name
          <input
            name="arabicName"
            dir="auto"
            defaultValue={initial?.arabicName ?? ""}
          />
        </label>
        <label>
          Type
          <select
            name="type"
            value={type}
            onChange={(event) => {
              const next = event.target.value as Product["type"];
              setType(next);
              if (next !== "STOCK_ITEM") setTracking(false);
            }}
          >
            <option value="STOCK_ITEM">Stock item</option>
            <option value="SERVICE">Service</option>
            <option value="NON_STOCK_ITEM">Non-stock item</option>
          </select>
        </label>
        <label>
          Unit
          <select name="unitId" defaultValue={initial?.unit.id} required>
            <option value="">Choose unit</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name} ({unit.symbol})
              </option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select name="categoryId" defaultValue={initial?.category?.id ?? ""}>
            <option value="">No category</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Brand
          <select name="brandId" defaultValue={initial?.brand?.id ?? ""}>
            <option value="">No brand</option>
            {brands.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          SKU
          <input name="sku" defaultValue={initial?.sku ?? ""} />
        </label>
        <label>
          Barcode
          <input name="barcode" defaultValue={initial?.barcode ?? ""} />
        </label>
        <label>
          Cost (QAR)
          <input
            name="cost"
            inputMode="decimal"
            pattern="\d+(\.\d{1,2})?"
            defaultValue={((initial?.costMinor ?? 0) / 100).toFixed(2)}
            required
          />
        </label>
        <label>
          Selling price (QAR)
          <input
            name="price"
            inputMode="decimal"
            pattern="\d+(\.\d{1,2})?"
            defaultValue={((initial?.priceMinor ?? 0) / 100).toFixed(2)}
            required
          />
        </label>
        <label>
          Minimum stock
          <input
            name="minimumStock"
            inputMode="decimal"
            disabled={!tracking}
            defaultValue={initial?.minimumStock ?? ""}
          />
        </label>
        <label>
          Image URL
          <input
            name="imageUrl"
            type="url"
            defaultValue={initial?.imageUrl ?? ""}
          />
        </label>
      </div>
      <label>
        Description
        <textarea
          name="description"
          defaultValue={initial?.description ?? ""}
        />
      </label>
      <div className="check-row">
        <label>
          <input
            type="checkbox"
            checked={tracking}
            disabled={type !== "STOCK_ITEM"}
            onChange={(event) => setTracking(event.target.checked)}
          />{" "}
          Track inventory
        </label>
        <label>
          <input
            name="allowNegativeStock"
            type="checkbox"
            defaultChecked={initial?.allowNegativeStock}
            disabled={!tracking}
          />{" "}
          Allow negative stock
        </label>
        <label>
          <input
            name="isActive"
            type="checkbox"
            defaultChecked={initial?.isActive ?? true}
          />{" "}
          Active
        </label>
      </div>
      <button disabled={saving}>
        {saving ? "Saving…" : initial ? "Save changes" : "Create product"}
      </button>
      {message && <p className="notice">{message}</p>}
    </form>
  );
}
