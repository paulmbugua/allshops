import { AppShell } from "../components/app-shell";
import { ReferenceManager } from "../components/reference-manager";
export default function CategoriesPage() {
  return (
    <AppShell title="Categories">
      <ReferenceManager kind="categories" />
    </AppShell>
  );
}
