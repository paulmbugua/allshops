"use client";
/* Uploaded logos are normalized to bounded WebP files by the API. */
/* eslint-disable @next/next/no-img-element */
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
  logoUrl: string | null;
  welcomeHeadline: string | null;
  tagline: string | null;
  motto: string | null;
  welcomeMessage: string | null;
  brandPrimaryColor: string;
  brandAccentColor: string;
  idleTimeoutMinutes: number;
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
  const [uploading, setUploading] = useState(false);
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
            welcomeHeadline: data.get("welcomeHeadline") || null,
            tagline: data.get("tagline") || null,
            motto: data.get("motto") || null,
            welcomeMessage: data.get("welcomeMessage") || null,
            brandPrimaryColor: data.get("brandPrimaryColor"),
            brandAccentColor: data.get("brandAccentColor"),
            idleTimeoutMinutes: Number(data.get("idleTimeoutMinutes")),
          }),
        },
      );
      setOrganization(updated);
      setMessage("Business details saved.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Unable to save.");
    }
  }
  async function uploadLogo(file?: File) {
    if (!organization || !file) return;
    setUploading(true);
    setMessage("");
    const body = new FormData();
    body.set("image", file);
    try {
      const updated = await api<Organization>(
        `/organizations/${organization.id}/logo`,
        {
          method: "POST",
          body,
        },
      );
      setOrganization(updated);
      setMessage("Company logo uploaded.");
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : "Unable to upload logo.",
      );
    } finally {
      setUploading(false);
    }
  }
  return (
    <AppShell title="Business settings">
      <section className="card">
        {!organization ? (
          <p>{message || "Loading…"}</p>
        ) : (
          <form className="form" onSubmit={submit}>
            <div className="branding-settings-heading">
              <div>
                <span className="eyebrow">Shop identity</span>
                <h2>Welcome screen</h2>
                <p className="muted">
                  Shown whenever a register is idle or a team member signs out.
                </p>
              </div>
              <a
                className="secondary button-link"
                href={`/welcome?organization=${organization.id}`}
                target="_blank"
                rel="noreferrer"
              >
                Preview welcome screen
              </a>
            </div>
            <div className="brand-logo-editor">
              {organization.logoUrl ? (
                <img src={organization.logoUrl} alt="Current company logo" />
              ) : (
                <span>{organization.name.slice(0, 2).toUpperCase()}</span>
              )}
              <label>
                Company logo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={!canUpdate || uploading}
                  onChange={(event) => void uploadLogo(event.target.files?.[0])}
                />
                <small>
                  Square PNG, JPEG or WebP works best. Maximum 5 MB.
                </small>
              </label>
            </div>
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
              <label>
                Welcome headline
                <input
                  name="welcomeHeadline"
                  maxLength={120}
                  defaultValue={organization.welcomeHeadline ?? ""}
                  disabled={!canUpdate}
                  placeholder={organization.name}
                />
              </label>
              <label>
                Tagline
                <input
                  name="tagline"
                  maxLength={180}
                  defaultValue={organization.tagline ?? ""}
                  disabled={!canUpdate}
                  placeholder="Beautiful service. Brilliantly simple."
                />
              </label>
              <label>
                Motto
                <input
                  name="motto"
                  maxLength={180}
                  defaultValue={organization.motto ?? ""}
                  disabled={!canUpdate}
                  placeholder="Quality in every detail"
                />
              </label>
              <label>
                Idle timeout (minutes)
                <input
                  name="idleTimeoutMinutes"
                  type="number"
                  min="1"
                  max="120"
                  defaultValue={organization.idleTimeoutMinutes}
                  disabled={!canUpdate}
                  required
                />
              </label>
              <label>
                Primary colour
                <input
                  name="brandPrimaryColor"
                  type="color"
                  defaultValue={organization.brandPrimaryColor}
                  disabled={!canUpdate}
                />
              </label>
              <label>
                Accent colour
                <input
                  name="brandAccentColor"
                  type="color"
                  defaultValue={organization.brandAccentColor}
                  disabled={!canUpdate}
                />
              </label>
            </div>
            <label>
              Welcome message
              <textarea
                name="welcomeMessage"
                maxLength={600}
                rows={4}
                defaultValue={organization.welcomeMessage ?? ""}
                disabled={!canUpdate}
                placeholder="Tell customers what makes your business special."
              />
            </label>
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
