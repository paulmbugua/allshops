"use client";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../../components/app-shell";
import { api, selectedOrganization, type CurrentUser } from "../../lib/api";
interface Organization {
  id: string;
  name: string;
  legalName: string | null;
  arabicName: string | null;
  businessType: string;
  email: string | null;
  phone: string | null;
  currency: string;
  timezone: string;
  status: string;
}
interface Role {
  code: string;
  permissions: { permission: { code: string } }[];
}
export default function BusinessSettingsPage() {
  const [organization, setOrganization] = useState<Organization>();
  const [canUpdate, setCanUpdate] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void load();
  }, []);
  async function load() {
    const id = selectedOrganization();
    if (!id) {
      window.location.assign("/onboarding");
      return;
    }
    try {
      const [business, me, roles] = await Promise.all([
        api<Organization>(`/organizations/${id}`),
        api<CurrentUser>("/auth/me"),
        api<Role[]>(`/organizations/${id}/roles`),
      ]);
      const membership = me.memberships.find(
        (item) => item.organizationId === id,
      );
      const role = roles.find((item) => item.code === membership?.role);
      setCanUpdate(
        Boolean(
          role?.permissions.some(
            (item) => item.permission.code === "organization.update",
          ),
        ),
      );
      setOrganization(business);
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : "Unable to load business.",
      );
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organization) return;
    const data = new FormData(event.currentTarget);
    try {
      const updated = await api<Organization>(
        `/organizations/${organization.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: data.get("name"),
            legalName: data.get("legalName") || undefined,
            arabicName: data.get("arabicName") || undefined,
            phone: data.get("phone") || undefined,
            email: data.get("email") || undefined,
          }),
        },
      );
      setOrganization(updated);
      setMessage("Business details saved.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Unable to save.");
    }
  }
  return (
    <AppShell title="Business settings">
      <section className="card">
        {!organization ? (
          <p>{message || "Loading…"}</p>
        ) : (
          <form className="form" onSubmit={submit}>
            <div className="form-grid">
              <label>
                Business name
                <input
                  name="name"
                  defaultValue={organization.name}
                  disabled={!canUpdate}
                  required
                />
              </label>
              <label>
                Legal name
                <input
                  name="legalName"
                  defaultValue={organization.legalName ?? ""}
                  disabled={!canUpdate}
                />
              </label>
              <label>
                Arabic name
                <input
                  name="arabicName"
                  defaultValue={organization.arabicName ?? ""}
                  disabled={!canUpdate}
                />
              </label>
              <label>
                Phone
                <input
                  name="phone"
                  defaultValue={organization.phone ?? ""}
                  disabled={!canUpdate}
                />
              </label>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  defaultValue={organization.email ?? ""}
                  disabled={!canUpdate}
                />
              </label>
            </div>
            <p className="muted">
              {organization.businessType} · {organization.currency} ·{" "}
              {organization.timezone} · {organization.status}
            </p>
            {message && <p>{message}</p>}
            {canUpdate && <button>Save changes</button>}
          </form>
        )}
      </section>
    </AppShell>
  );
}
