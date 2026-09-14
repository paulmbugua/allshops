"use client";
import { useState, type FormEvent } from "react";
import { api, selectOrganization } from "../lib/api";

interface Organization {
  id: string;
  name: string;
}

export default function OnboardingPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const organization = await api<Organization>("/organizations", {
        method: "POST",
        body: JSON.stringify({
          name: data.get("businessName"),
          businessType: data.get("businessType"),
          phone: data.get("businessPhone") || undefined,
          email: data.get("businessEmail") || undefined,
          currency: "QAR",
          timezone: "Asia/Qatar",
        }),
      });
      selectOrganization(organization.id);
      await api(`/organizations/${organization.id}/branches`, {
        method: "POST",
        body: JSON.stringify({
          name: data.get("branchName"),
          code: data.get("branchCode"),
          address: data.get("address") || undefined,
          phone: data.get("branchPhone") || undefined,
          timezone: "Asia/Qatar",
        }),
      });
      window.location.assign("/dashboard");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to finish setup.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="auth-page">
      <form className="card form wide" onSubmit={submit}>
        <span className="eyebrow">Business onboarding</span>
        <h1>Set up your business</h1>
        <div className="form-grid">
          <label>
            Business name
            <input name="businessName" required minLength={2} />
          </label>
          <label>
            Business type
            <select name="businessType" defaultValue="RETAIL">
              <option value="RETAIL">Retail</option>
              <option value="GROCERY">Grocery</option>
              <option value="RESTAURANT_CAFE">Restaurant / café</option>
              <option value="SALON">Salon</option>
              <option value="BARBERSHOP">Barbershop</option>
              <option value="GENERAL_SERVICES">General services</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label>
            Business phone
            <input name="businessPhone" />
          </label>
          <label>
            Business email
            <input name="businessEmail" type="email" />
          </label>
        </div>
        <h2>First branch</h2>
        <div className="form-grid">
          <label>
            Branch name
            <input
              name="branchName"
              required
              minLength={2}
              defaultValue="Main Branch"
            />
          </label>
          <label>
            Branch code
            <input
              name="branchCode"
              required
              pattern="[A-Z0-9_-]+"
              defaultValue="MAIN"
            />
          </label>
          <label>
            Address
            <input name="address" />
          </label>
          <label>
            Phone
            <input name="branchPhone" />
          </label>
        </div>
        <p className="muted">Currency: QAR · Timezone: Asia/Qatar</p>
        {error && <p className="error">{error}</p>}
        <button disabled={loading}>
          {loading ? "Creating workspace…" : "Complete setup"}
        </button>
      </form>
    </main>
  );
}
