"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../../components/app-shell";
import { api, selectedOrganization, type CurrentUser } from "../../lib/api";
import type { Staff } from "../../lib/phase5";

export default function NewStaffPage() {
  const router = useRouter();
  const organizationId = selectedOrganization();
  const [form, setForm] = useState({
    displayName: "",
    jobTitle: "",
    phone: "",
    email: "",
  });
  const [roles, setRoles] = useState<
    { id: string; name: string; code: string }[]
  >([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [createAccess, setCreateAccess] = useState(true);
  const [roleId, setRoleId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [canInvite, setCanInvite] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!organizationId) return;
    void Promise.all([
      api<{ id: string; name: string; code: string }[]>(
        `/organizations/${organizationId}/roles`,
      ),
      api<{ id: string; name: string }[]>(
        `/organizations/${organizationId}/branches`,
      ),
      api<CurrentUser>("/auth/me"),
    ])
      .then(([roleRows, branchRows, me]) => {
        setRoles(
          roleRows.filter((role) => !["OWNER", "ADMIN"].includes(role.code)),
        );
        setBranches(branchRows);
        setRoleId(
          roleRows.find((role) => role.code === "CASHIER")?.id ??
            roleRows[0]?.id ??
            "",
        );
        setBranchId(branchRows[0]?.id ?? "");
        const membership = me.memberships.find(
          (row) => row.organizationId === organizationId,
        );
        setCanInvite(
          Boolean(
            membership?.permissions.includes("user.invite") &&
            membership.permissions.includes("role.assign"),
          ),
        );
      })
      .catch(() => setCreateAccess(false));
  }, [organizationId]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!organizationId) return;
    try {
      let userId: string | undefined;
      let invitationMessage = "";
      if (createAccess && canInvite) {
        if (!form.email)
          throw new Error(
            "An email address is required for staff login access.",
          );
        const invitation = await api<{ userId: string; emailDelivery: string }>(
          `/organizations/${organizationId}/users`,
          {
            method: "POST",
            body: JSON.stringify({
              name: form.displayName,
              email: form.email,
              roleId,
              branchId: branchId || null,
            }),
          },
        );
        userId = invitation.userId;
        invitationMessage =
          invitation.emailDelivery === "SENT"
            ? " Login invitation emailed."
            : " Login created; check invitation email configuration.";
      }
      const row = await api<Staff>(`/organizations/${organizationId}/staff`, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          userId: userId ?? null,
          email: form.email || null,
          phone: form.phone || null,
          jobTitle: form.jobTitle || null,
        }),
      });
      if (branchId)
        await api(`/organizations/${organizationId}/staff/${row.id}/branches`, {
          method: "POST",
          body: JSON.stringify({ branchId, isPrimary: true, isActive: true }),
        });
      setMessage(`Staff profile created.${invitationMessage}`);
      router.push(`/staff/${row.id}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create staff.",
      );
    }
  }
  return (
    <AppShell title="New staff member">
      <section className="card">
        <form className="stack" onSubmit={submit}>
          <label>
            Display name
            <input
              required
              value={form.displayName}
              onChange={(e) =>
                setForm({ ...form, displayName: e.target.value })
              }
            />
          </label>
          <p className="notice">
            The employee ID is generated automatically from your company
            initials.
          </p>
          <label>
            Job title
            <input
              value={form.jobTitle}
              onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
            />
          </label>
          <label>
            Phone
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          {canInvite && (
            <div className="staff-access-panel">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={createAccess}
                  onChange={(event) => setCreateAccess(event.target.checked)}
                />{" "}
                Create AllShops login access
              </label>
              <p className="muted">
                The employee receives a secure email link and chooses their own
                password.
              </p>
              {createAccess && (
                <div className="form-grid">
                  <label>
                    Role
                    <select
                      value={roleId}
                      onChange={(event) => setRoleId(event.target.value)}
                      required
                    >
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Primary branch
                    <select
                      value={branchId}
                      onChange={(event) => setBranchId(event.target.value)}
                      required
                    >
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
          )}
          {message && <p className="error">{message}</p>}
          <button>Create staff member</button>
        </form>
      </section>
    </AppShell>
  );
}
