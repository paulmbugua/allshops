"use client";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../../components/app-shell";
import { api, selectedOrganization, type CurrentUser } from "../../lib/api";
interface Role {
  id: string;
  name: string;
  code: string;
  permissions: { permission: { code: string } }[];
}
interface Branch {
  id: string;
  name: string;
  code: string;
}
interface Member {
  id: string;
  branchId: string | null;
  status: string;
  user: { id: string; name: string; email: string; status: string };
  role: { id: string; name: string; code: string };
  branch: Branch | null;
}
interface InvitationResult {
  invitationRequired: boolean;
  invitationToken?: string;
  expiresAt?: string;
  emailDelivery?: "SENT" | "FAILED" | "NOT_CONFIGURED" | "EXISTING_ACCOUNT";
}
const branchRoles = new Set([
  "BRANCH_MANAGER",
  "POS_SUPERVISOR",
  "CASHIER",
  "SERVICE_STAFF",
]);
const roleGuidance: Record<string, string> = {
  OWNER: "Full control, ownership, security and subscription billing.",
  ADMIN: "Full administration except owner-only billing control.",
  MANAGER: "Business-wide operations, people, stock, reports and recovery.",
  BRANCH_MANAGER: "Manager capabilities constrained to one assigned branch.",
  POS_SUPERVISOR:
    "POS operations, discounts, credit and audited error recovery.",
  CASHIER: "Branch POS, receipts, held sales and customer capture only.",
  INVENTORY_MANAGER: "Catalogue, purchasing, stock movement and valuation.",
  ACCOUNTANT:
    "Financial records, balances, costs and reports without POS control.",
  SERVICE_STAFF: "Assigned appointments and own commissions.",
  AUDITOR: "Read-only operational, financial and audit visibility.",
};
export default function UserSettingsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const organizationId = selectedOrganization();
  useEffect(() => {
    void load();
  }, [organizationId]);
  async function load() {
    if (!organizationId) {
      window.location.assign("/onboarding");
      return;
    }
    try {
      const [memberRows, roleRows, branchRows, me] = await Promise.all([
        api<Member[]>(`/organizations/${organizationId}/users`),
        api<Role[]>(`/organizations/${organizationId}/roles`),
        api<Branch[]>(`/organizations/${organizationId}/branches`),
        api<CurrentUser>("/auth/me"),
      ]);
      const membership = me.memberships.find(
        (item) => item.organizationId === organizationId,
      );
      setMembers(memberRows);
      setRoles(roleRows);
      setBranches(branchRows);
      setPermissions(membership?.permissions ?? []);
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : "Unable to load users.",
      );
    }
  }
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const result = await api<InvitationResult>(
        `/organizations/${organizationId}/users`,
        {
          method: "POST",
          body: JSON.stringify({
            name: data.get("name"),
            email: data.get("email"),
            roleId: data.get("roleId"),
            branchId: data.get("branchId") || null,
          }),
        },
      );
      form.reset();
      setMessage(
        result.emailDelivery === "SENT"
          ? "Invitation emailed. The team member will create a private password from the secure link."
          : result.emailDelivery === "FAILED"
            ? "User created, but email delivery failed. Check the SMTP settings before inviting more users."
            : result.invitationToken
              ? `Invitation created. Development token: ${result.invitationToken}`
              : result.emailDelivery === "EXISTING_ACCOUNT"
                ? "Existing AllShops user added. They can sign in with their current password."
                : "User added, but invitation email is not configured.",
      );
      await load();
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : "Unable to add user.",
      );
    }
  }
  async function update(event: FormEvent<HTMLFormElement>, member: Member) {
    event.preventDefault();
    if (!organizationId) return;
    const data = new FormData(event.currentTarget);
    try {
      const updated = await api<Member>(
        `/organizations/${organizationId}/users/${member.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            roleId: data.get("roleId"),
            branchId: data.get("branchId") || null,
            status: data.get("status"),
          }),
        },
      );
      setMembers((rows) =>
        rows.map((row) => (row.id === updated.id ? updated : row)),
      );
      setMessage("Membership updated.");
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : "Unable to update user.",
      );
    }
  }
  async function resend(member: Member) {
    if (!organizationId) return;
    try {
      const result = await api<InvitationResult>(
        `/organizations/${organizationId}/users/${member.id}/resend-invitation`,
        { method: "POST" },
      );
      setMessage(
        result.emailDelivery === "SENT"
          ? `A fresh activation link was emailed to ${member.user.email}.`
          : "A fresh invitation was created, but email delivery failed. Check SMTP settings.",
      );
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Unable to resend invitation.",
      );
    }
  }
  const canInvite =
    permissions.includes("user.invite") && permissions.includes("role.assign");
  const canUpdate =
    permissions.includes("user.update") && permissions.includes("role.assign");
  return (
    <AppShell title="Users">
      <section className="card">
        <span className="eyebrow">Least-privilege access</span>
        <h2>Role allocation</h2>
        <p className="muted">
          Assign the narrowest role needed. Branch roles cannot be saved without
          a branch, and nobody can grant permissions they do not hold.
        </p>
        <div className="context-grid">
          {roles.map((role) => (
            <div key={role.id}>
              <strong>{role.name}</strong>
              <small>
                {roleGuidance[role.code] ?? "Custom organization role"}
              </small>
              <small>
                {role.permissions.length} permissions
                {branchRoles.has(role.code) ? " · branch required" : ""}
              </small>
            </div>
          ))}
        </div>
        <div className="table-list">
          {members.map((member) => (
            <form
              className="table-row member-row"
              key={member.id}
              onSubmit={(event) => update(event, member)}
            >
              <div>
                <strong>{member.user.name}</strong>
                <small>{member.user.email}</small>
              </div>
              <select
                name="roleId"
                defaultValue={member.role.id}
                disabled={!canUpdate}
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                    {branchRoles.has(role.code) ? " · branch" : ""}
                  </option>
                ))}
              </select>
              <select
                name="branchId"
                defaultValue={member.branchId ?? ""}
                disabled={!canUpdate}
              >
                <option value="">All branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
              <select
                name="status"
                defaultValue={
                  member.status === "INVITED" ? "ACTIVE" : member.status
                }
                disabled={!canUpdate}
              >
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Inactive</option>
              </select>
              <div className="member-actions">
                {canUpdate && <button className="secondary">Save</button>}
                {member.status === "INVITED" && canInvite && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void resend(member)}
                  >
                    Resend invite
                  </button>
                )}
              </div>
            </form>
          ))}
        </div>
        {canInvite && (
          <form className="form compact" onSubmit={invite}>
            <h2>Add user</h2>
            <p className="muted">
              A branded, one-time activation link is emailed to new users. They
              choose their own password; administrators never see or store it.
            </p>
            <div className="form-grid">
              <label>
                Name
                <input name="name" required minLength={2} />
              </label>
              <label>
                Email
                <input name="email" type="email" required />
              </label>
              <label>
                Role
                <select name="roleId" required>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                      {branchRoles.has(role.code) ? " · branch" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Branch
                <select name="branchId">
                  <option value="">All branches</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button>Add user</button>
          </form>
        )}
        {message && <p className="notice">{message}</p>}
      </section>
    </AppShell>
  );
}
