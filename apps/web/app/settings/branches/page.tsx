"use client";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../../components/app-shell";
import { api, selectedOrganization, type CurrentUser } from "../../lib/api";
interface Branch {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
}
interface Role {
  code: string;
  permissions: { permission: { code: string } }[];
}
export default function BranchSettingsPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const organizationId = selectedOrganization();
  useEffect(() => {
    if (!organizationId) {
      window.location.assign("/onboarding");
      return;
    }
    void Promise.all([
      api<Branch[]>(`/organizations/${organizationId}/branches`),
      api<CurrentUser>("/auth/me"),
      api<Role[]>(`/organizations/${organizationId}/roles`),
    ])
      .then(([items, me, roles]) => {
        const membership = me.memberships.find(
          (item) => item.organizationId === organizationId,
        );
        setBranches(items);
        setPermissions(
          roles
            .find((role) => role.code === membership?.role)
            ?.permissions.map((item) => item.permission.code) ?? [],
        );
      })
      .catch((caught: unknown) =>
        setMessage(
          caught instanceof Error ? caught.message : "Unable to load branches.",
        ),
      );
  }, [organizationId]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const data = new FormData(event.currentTarget);
    try {
      const branch = await api<Branch>(
        `/organizations/${organizationId}/branches`,
        {
          method: "POST",
          body: JSON.stringify({
            name: data.get("name"),
            address: data.get("address") || undefined,
            phone: data.get("phone") || undefined,
            timezone: "Asia/Qatar",
          }),
        },
      );
      setBranches((current) => [...current, branch]);
      event.currentTarget.reset();
      setMessage("Branch created.");
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : "Unable to create branch.",
      );
    }
  }
  async function toggle(branch: Branch) {
    if (!organizationId) return;
    try {
      const updated = await api<Branch>(
        `/organizations/${organizationId}/branches/${branch.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ isActive: !branch.isActive }),
        },
      );
      setBranches((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : "Unable to update branch.",
      );
    }
  }
  const canCreate = permissions.includes("branch.create");
  const canUpdate = permissions.includes("branch.update");
  return (
    <AppShell title="Branches">
      <section className="card">
        <div className="table-list">
          {branches.map((branch) => (
            <div className="table-row" key={branch.id}>
              <div>
                <strong>{branch.name}</strong>
                <small>
                  {branch.code} · {branch.address || "No address"}
                </small>
              </div>
              <span className={branch.isActive ? "pill active" : "pill"}>
                {branch.isActive ? "Active" : "Inactive"}
              </span>
              {canUpdate && (
                <button className="secondary" onClick={() => toggle(branch)}>
                  {branch.isActive ? "Deactivate" : "Activate"}
                </button>
              )}
            </div>
          ))}
        </div>
        {canCreate && (
          <form className="form compact" onSubmit={create}>
            <h2>Add branch</h2>
            <div className="form-grid">
              <label>
                Name
                <input name="name" required minLength={2} />
              </label>
              <p className="muted">
                Branch ID is generated automatically from its name.
              </p>
              <label>
                Address
                <input name="address" />
              </label>
              <label>
                Phone
                <input name="phone" />
              </label>
            </div>
            <button>Create branch</button>
          </form>
        )}
        {message && <p>{message}</p>}
      </section>
    </AppShell>
  );
}
