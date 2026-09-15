"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { api, selectedOrganization } from "../../lib/api";

type Faq = {
  id: string;
  category: string;
  question: string;
  answer: string;
  platforms: string[];
};
type Diagnostics = {
  appVersion: string;
  pendingSyncConflicts: number;
  organization: {
    status: string;
    subscription: { status: string; plan: { code: string } } | null;
  };
  devices: {
    id: string;
    name: string;
    status: string;
    lastSyncAt: string | null;
    offlineEntitled: boolean;
  }[];
  supportProfile: { roleCode: string; branchScoped: boolean; faqs: Faq[] };
};

export default function SupportDiagnosticsPage() {
  const organizationId = selectedOrganization();
  const [data, setData] = useState<Diagnostics>();
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    if (!organizationId) return;
    try {
      setData(
        await api<Diagnostics>(
          `/organizations/${organizationId}/support/diagnostics`,
        ),
      );
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load support diagnostics.",
      );
    }
  }, [organizationId]);
  useEffect(() => {
    void load();
  }, [load]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (data?.supportProfile.faqs ?? []).filter(
      (faq) =>
        !term ||
        `${faq.category} ${faq.question} ${faq.answer}`
          .toLowerCase()
          .includes(term),
    );
  }, [data, query]);
  const groups = useMemo(
    () =>
      filtered.reduce((map, faq) => {
        map.set(faq.category, [...(map.get(faq.category) ?? []), faq]);
        return map;
      }, new Map<string, Faq[]>()),
    [filtered],
  );

  return (
    <AppShell title="Help & diagnostics">
      <section className="support-hero">
        <div>
          <span>ALLSHOPS SUPPORT CENTRE</span>
          <h2>Answers for your workspace</h2>
          <p>
            Guidance is tailored to your{" "}
            {data?.supportProfile.roleCode.replaceAll("_", " ").toLowerCase() ??
              "assigned"}{" "}
            role across web and mobile.
          </p>
        </div>
        <button className="secondary" onClick={() => void load()}>
          Refresh diagnostics
        </button>
      </section>
      {data && (
        <section className="diagnostic-grid">
          <article>
            <span>Subscription</span>
            <strong>
              {data.organization.subscription?.status ?? "Not configured"}
            </strong>
            <small>
              {data.organization.subscription?.plan.code ?? "No plan"}
            </small>
          </article>
          <article>
            <span>Devices</span>
            <strong>
              {
                data.devices.filter((device) => device.status === "ACTIVE")
                  .length
              }{" "}
              active
            </strong>
            <small>{data.devices.length} registered</small>
          </article>
          <article
            className={data.pendingSyncConflicts ? "attention" : "healthy"}
          >
            <span>Sync conflicts</span>
            <strong>{data.pendingSyncConflicts}</strong>
            <small>
              {data.pendingSyncConflicts
                ? "Supervisor review needed"
                : "Everything is clear"}
            </small>
          </article>
          <article>
            <span>App version</span>
            <strong>{data.appVersion}</strong>
            <small>
              {data.supportProfile.branchScoped
                ? "Branch-scoped access"
                : "Organization-wide access"}
            </small>
          </article>
        </section>
      )}
      <section className="card faq-panel">
        <div className="toolbar">
          <div>
            <h2>Frequently asked questions</h2>
            <p className="muted">
              Safe, practical guidance for the tools you can access.
            </p>
          </div>
          <input
            aria-label="Search help"
            placeholder="Search POS, stock, offline, billing…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {[...groups.entries()].map(([category, faqs]) => (
          <div className="faq-group" key={category}>
            <h3>{category}</h3>
            {faqs.map((faq) => (
              <details key={faq.id}>
                <summary>
                  {faq.question}
                  <span>+</span>
                </summary>
                <p>{faq.answer}</p>
                <small>{faq.platforms.join(" · ")}</small>
              </details>
            ))}
          </div>
        ))}
        {!filtered.length && (
          <p className="notice">No answers match that search.</p>
        )}
      </section>
      {message && <p className="notice">{message}</p>}
    </AppShell>
  );
}
