import { AppShell } from "../components/app-shell";
import { ReferenceManager } from "../components/reference-manager";
export default function UnitsPage() {
  return (
    <AppShell title="Units">
      <ReferenceManager kind="units" />
    </AppShell>
  );
}
