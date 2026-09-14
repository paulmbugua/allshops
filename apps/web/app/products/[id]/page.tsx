"use client";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../../components/app-shell";
import { ProductForm } from "../../components/product-form";
import { Can } from "../../components/permission-context";
import { api, selectedOrganization } from "../../lib/api";
import {
  decimalCurrencyToMinor,
  formatMinorCurrency,
  type Product,
  type Variant,
} from "../../lib/catalogue";
export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [message, setMessage] = useState("");
  const [serviceProfile, setServiceProfile] = useState<{
    durationMinutes: number;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
    appointmentEnabled: boolean;
  } | null>(null);
  const organizationId = selectedOrganization();
  useEffect(() => {
    if (!organizationId) return;
    void api<Product>(`/organizations/${organizationId}/products/${id}`)
      .then((value) => {
        setProduct(value);
        if (value.type === "SERVICE")
          void api<typeof serviceProfile>(
            `/organizations/${organizationId}/products/${id}/service-profile`,
          )
            .then(setServiceProfile)
            .catch(() => undefined);
      })
      .catch((error) =>
        setMessage(
          error instanceof Error ? error.message : "Unable to load product.",
        ),
      );
  }, [organizationId, id]);
  async function addVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const price = String(data.get("price") ?? "").trim();
      const variant = await api<Variant>(
        `/organizations/${organizationId}/products/${id}/variants`,
        {
          method: "POST",
          body: JSON.stringify({
            name: data.get("name"),
            sku: data.get("sku") || null,
            barcode: data.get("barcode") || null,
            priceMinor: price ? decimalCurrencyToMinor(price) : null,
          }),
        },
      );
      setProduct((value) =>
        value
          ? { ...value, variants: [...(value.variants ?? []), variant] }
          : value,
      );
      form.reset();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create variant.",
      );
    }
  }
  async function saveServiceProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const data = new FormData(event.currentTarget);
    try {
      const saved = await api<NonNullable<typeof serviceProfile>>(
        `/organizations/${organizationId}/products/${id}/service-profile`,
        {
          method: "PUT",
          body: JSON.stringify({
            durationMinutes: Number(data.get("durationMinutes")),
            bufferBeforeMinutes: Number(data.get("bufferBeforeMinutes")),
            bufferAfterMinutes: Number(data.get("bufferAfterMinutes")),
            appointmentEnabled: data.get("appointmentEnabled") === "on",
          }),
        },
      );
      setServiceProfile(saved);
      setMessage("Service booking settings saved.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to save service settings.",
      );
    }
  }
  return (
    <AppShell title={product?.name ?? "Product"}>
      <section className="card">
        {product && (
          <>
            <Can permissions={["product.update"]}>
              <ProductForm
                initial={product}
                onSaved={(updated) => setProduct({ ...product, ...updated })}
              />
            </Can>
            {product.type === "SERVICE" && (
              <Can permissions={["product.update"]}>
                <div className="compact">
                  <h2>Appointment settings</h2>
                  <form className="form compact" onSubmit={saveServiceProfile}>
                    <div className="form-grid">
                      <label>
                        Duration (minutes)
                        <input
                          name="durationMinutes"
                          type="number"
                          min="1"
                          required
                          defaultValue={serviceProfile?.durationMinutes ?? 30}
                        />
                      </label>
                      <label>
                        Buffer before
                        <input
                          name="bufferBeforeMinutes"
                          type="number"
                          min="0"
                          defaultValue={
                            serviceProfile?.bufferBeforeMinutes ?? 0
                          }
                        />
                      </label>
                      <label>
                        Buffer after
                        <input
                          name="bufferAfterMinutes"
                          type="number"
                          min="0"
                          defaultValue={serviceProfile?.bufferAfterMinutes ?? 0}
                        />
                      </label>
                      <label>
                        <input
                          name="appointmentEnabled"
                          type="checkbox"
                          defaultChecked={
                            serviceProfile?.appointmentEnabled ?? true
                          }
                        />{" "}
                        Enable appointments
                      </label>
                    </div>
                    <button>Save appointment settings</button>
                  </form>
                </div>
              </Can>
            )}
            <div className="compact">
              <h2>Variants</h2>
              <div className="table-list">
                {product.variants?.map((variant) => (
                  <div className="table-row" key={variant.id}>
                    <div>
                      <strong>{variant.name}</strong>
                      <small>{variant.sku ?? "No SKU"}</small>
                    </div>
                    <span>
                      {variant.priceMinor == null
                        ? "Inherits product price"
                        : formatMinorCurrency(variant.priceMinor)}
                    </span>
                    <span
                      className={`pill ${variant.isActive ? "active" : ""}`}
                    >
                      {variant.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                ))}
              </div>
              <Can permissions={["product.create"]}>
                <form className="form compact" onSubmit={addVariant}>
                  <div className="form-grid">
                    <label>
                      Variant name
                      <input name="name" required />
                    </label>
                    <label>
                      SKU
                      <input name="sku" />
                    </label>
                    <label>
                      Barcode
                      <input name="barcode" />
                    </label>
                    <label>
                      Price override (QAR)
                      <input name="price" inputMode="decimal" />
                    </label>
                  </div>
                  <button>Add variant</button>
                </form>
              </Can>
            </div>
          </>
        )}
        {message && <p className="notice">{message}</p>}
      </section>
    </AppShell>
  );
}
