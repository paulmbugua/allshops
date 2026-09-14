import { AppShell } from "../components/app-shell";
import { ReferenceManager } from "../components/reference-manager";
export default function BrandsPage() {
  return (
    <AppShell title="Brands">
      <ReferenceManager kind="brands" />
    </AppShell>
  );
}
