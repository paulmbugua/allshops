"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { api, selectOrganization, type CurrentUser } from "../lib/api";

interface Organization {
  id: string;
  name: string;
}

export default function OnboardingPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [verification, setVerification] = useState<
    "CHECKING" | "REQUIRED" | "VERIFIED"
  >("CHECKING");
  useEffect(() => {
    void api<CurrentUser>("/auth/me")
      .then((user) =>
        setVerification(user.emailVerifiedAt ? "VERIFIED" : "REQUIRED"),
      )
      .catch(() => setVerification("REQUIRED"));
  }, []);
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
  if (verification === "CHECKING") {
    return (
      <main className="auth-page">
        <section className="card">
          <span className="eyebrow">Secure business setup</span>
          <h1>Confirming your account…</h1>
          <p className="muted">Checking email activation status.</p>
        </section>
      </main>
    );
  }
  if (verification === "REQUIRED") {
    return (
      <main className="auth-page">
        <section className="card">
          <span className="eyebrow">Email activation required</span>
          <h1>Activate before creating your shop</h1>
          <p>
            Open the secure activation link sent to your registered email.
            After verification, you will return here to create your business
            and first branch.
          </p>
          <div className="actions">
            <Link className="button-link" href="/resend-activation">
              Resend activation email
            </Link>
            <Link className="button-link secondary" href="/login">
              Return to sign in
            </Link>
          </div>
        </section>
      </main>
    );
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
          <p className="muted">
            The branch ID is generated automatically from its name.
          </p>
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
