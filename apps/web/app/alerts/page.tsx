"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import { api, selectedOrganization, type Membership, type CurrentUser } from "../lib/api";

type Alert = { id: string; type: string; severity: string; status: string; title: string; message: string; createdAt: string; entityType: string | null; entityId: string | null };
export default function AlertsPage() {
  const organizationId = selectedOrganization(); const [alerts, setAlerts] = useState<Alert[]>([]); const [membership, setMembership] = useState<Membership>(); const [message, setMessage] = useState("");
  async function load() { if (!organizationId) return; const [rows, user] = await Promise.all([api<Alert[]>(`/organizations/${organizationId}/alerts?page=1&pageSize=100`), api<CurrentUser>("/auth/me")]); setAlerts(rows); setMembership(user.memberships.find((item) => item.organizationId === organizationId)); }
  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load alerts.")); }, [organizationId]);
  async function update(id: string, action: "acknowledge" | "resolve") { if (!organizationId) return; await api(`/organizations/${organizationId}/alerts/${id}/${action}`, { method: "PATCH" }); setMessage(`Alert ${action}d.`); await load(); }
  return <AppShell title="Operational alerts"><section className="card"><div className="toolbar"><div><span className="eyebrow">Persistent control room</span><h2>Alerts that stay visible until handled</h2></div><button className="secondary" onClick={() => void load()}>Refresh</button></div>{message && <p className="notice">{message}</p>}<div className="data-table"><strong>Alert</strong><strong>Severity</strong><strong>Status</strong><strong>Created</strong><strong>Action</strong>{alerts.map((alert) => <div className="data-row" key={alert.id}><span><strong>{alert.title}</strong><small>{alert.message}</small></span><span className={`pill ${alert.severity === "CRITICAL" ? "danger" : "active"}`}>{alert.severity}</span><span>{alert.status}</span><span>{new Date(alert.createdAt).toLocaleString()}</span><span>{membership?.permissions.includes("alert.manage") && alert.status !== "RESOLVED" ? <>{alert.status === "OPEN" && <button className="secondary" onClick={() => void update(alert.id, "acknowledge")}>Acknowledge</button>}<button className="secondary" onClick={() => void update(alert.id, "resolve")}>Resolve</button></> : "—"}</span></div>)}</div>{alerts.length === 0 && <p className="muted">No active operational alerts.</p>}</section></AppShell>;
}
