"use client";

import { useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import { api, selectedOrganization, type CurrentUser, type Membership } from "../lib/api";
import { formatMinorCurrency } from "../lib/catalogue";

type Branch = { id: string; name: string };
type Shift = { id: string; branchId: string; status: string; openingCashMinor: number; expectedCashMinor: number | null; countedCashMinor: number | null; varianceMinor: number | null; openedAt: string; closedAt: string | null; branch?: { name: string }; cashier?: { name: string } };

export default function RegisterShiftsPage() {
  const organizationId = selectedOrganization();
  const [membership, setMembership] = useState<Membership>();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [message, setMessage] = useState("");
  const [branchId, setBranchId] = useState("");
  const [opening, setOpening] = useState("0");
  const [cashIn, setCashIn] = useState("");
  const [cashOut, setCashOut] = useState("");
  const [counted, setCounted] = useState("");
  const [movementReason, setMovementReason] = useState("");

  async function load() {
    if (!organizationId) return;
    const [user, branchRows, rows] = await Promise.all([
      api<CurrentUser>("/auth/me"),
      api<Branch[]>(`/organizations/${organizationId}/branches`),
      api<Shift[]>(`/organizations/${organizationId}/register-shifts`),
    ]);
    const member = user.memberships.find((item) => item.organizationId === organizationId);
    setMembership(member); setBranches(branchRows); setShifts(rows);
    setBranchId(member?.branchId ?? branchRows[0]?.id ?? "");
  }
  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load shifts.")); }, [organizationId]);
  const openShift = shifts.find((shift) => shift.status === "OPEN");
  async function open() {
    if (!organizationId || !branchId) return;
    await api(`/organizations/${organizationId}/register-shifts`, { method: "POST", body: JSON.stringify({ branchId, openingCashMinor: Math.round(Number(opening) * 100) }) });
    setMessage("Register opened. Cash movements and sales are now tracked for this shift."); await load();
  }
  async function addMovement(type: "CASH_IN" | "CASH_OUT") {
    if (!organizationId || !openShift) return;
    await api(`/organizations/${organizationId}/register-shifts/${openShift.id}/movements`, { method: "POST", body: JSON.stringify({ type, amountMinor: Math.round(Number(type === "CASH_IN" ? cashIn : cashOut) * 100), reason: movementReason }) });
    setCashIn(""); setCashOut(""); setMovementReason(""); setMessage("Cash movement recorded."); await load();
  }
  async function close() {
    if (!organizationId || !openShift) return;
    await api(`/organizations/${organizationId}/register-shifts/${openShift.id}/close`, { method: "PATCH", body: JSON.stringify({ countedCashMinor: Math.round(Number(counted) * 100) }) });
    setMessage("Shift closed. Variance is ready for supervisor approval."); await load();
  }
  async function approve(id: string) { if (!organizationId) return; await api(`/organizations/${organizationId}/register-shifts/${id}/approve`, { method: "PATCH" }); setMessage("Shift approved and audit-logged."); await load(); }
  return <AppShell title="Register shifts">
    <section className="card">
      <span className="eyebrow">Cash control</span><h2>{openShift ? "Shift in progress" : "Open a register shift"}</h2>
      {!openShift && membership?.permissions.includes("shift.open") && <div className="form-grid">
        <label>Branch<select value={branchId} disabled={Boolean(membership.branchId)} onChange={(event) => setBranchId(event.target.value)}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label>Opening float (QAR)<input type="number" min="0" value={opening} onChange={(event) => setOpening(event.target.value)} /></label>
        <button onClick={() => void open()}>Open register</button>
      </div>}
      {openShift && <div className="context-grid">
        <div><small>Opening float</small><strong>{formatMinorCurrency(openShift.openingCashMinor)}</strong></div>
        {membership?.permissions.includes("shift.cash_movement") && <>
          <label>Cash in (QAR)<input type="number" min="0" value={cashIn} onChange={(event) => setCashIn(event.target.value)} /></label>
          <label>Cash out (QAR)<input type="number" min="0" value={cashOut} onChange={(event) => setCashOut(event.target.value)} /></label>
          <label>Reason<input value={movementReason} onChange={(event) => setMovementReason(event.target.value)} /></label>
          <div><button className="secondary" onClick={() => void addMovement("CASH_IN")}>Record cash in</button> <button className="secondary" onClick={() => void addMovement("CASH_OUT")}>Record cash out</button></div>
        </>}
        {membership?.permissions.includes("shift.close") && <><label>Counted drawer (QAR)<input type="number" min="0" value={counted} onChange={(event) => setCounted(event.target.value)} /></label><button onClick={() => void close()}>Close shift</button></>}
      </div>}
      {message && <p className="notice">{message}</p>}
    </section>
    <section className="card"><h2>Recent shifts</h2><div className="data-table">
      <strong>Opened</strong><strong>Branch / cashier</strong><strong>Status</strong><strong>Expected</strong><strong>Counted</strong><strong>Variance</strong><strong>Action</strong>
      {shifts.map((shift) => <div className="data-row" key={shift.id}><span>{new Date(shift.openedAt).toLocaleString()}</span><span>{shift.branch?.name ?? shift.branchId}<small>{shift.cashier?.name}</small></span><span className="pill active">{shift.status}</span><span>{shift.expectedCashMinor == null ? "—" : formatMinorCurrency(shift.expectedCashMinor)}</span><span>{shift.countedCashMinor == null ? "—" : formatMinorCurrency(shift.countedCashMinor)}</span><strong>{shift.varianceMinor == null ? "—" : formatMinorCurrency(shift.varianceMinor)}</strong><span>{shift.status === "CLOSED" && membership?.permissions.includes("shift.approve") ? <button className="secondary" onClick={() => void approve(shift.id)}>Approve</button> : ""}</span></div>)}
    </div></section>
  </AppShell>;
}
