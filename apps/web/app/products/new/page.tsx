"use client";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/app-shell";
import { ProductForm } from "../../components/product-form";
export default function NewProductPage() {
  const router = useRouter();
  return (
    <AppShell title="New product">
      <section className="card">
        <ProductForm
          onSaved={(product) => router.push(`/products/${product.id}`)}
        />
      </section>
    </AppShell>
  );
}
