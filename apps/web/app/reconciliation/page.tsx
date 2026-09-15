"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../components/app-shell";
import {
  api,
  selectedOrganization,
  type CurrentUser,
  type Membership,
} from "../lib/api";
import { formatMinorCurrency } from "../lib/catalogue";

type Branch = { id: string; name: string };
type ReconciliationRow = {
  cashierId: string;
  cashierName: string;
  employeeNumber: string | null;
  branchId: string;
  branchName: string;
  transactionCount: number;
  totalSalesMinor: number;
  expectedCashMinor: number;
  cardSalesMinor: number;
  otherPaymentsMinor: number;
  creditSalesMinor: number;
  countedCashMinor: number | null;
  varianceMinor: number | null;
  reconciliationId: string | null;
  status: string;
  notes: string | null;
};
type Daily = {
  date: string;
  branchId: string | null;
  rows: ReconciliationRow[];
  aggregate: ReconciliationRow & { submittedCount: number };
};

const todayQatar = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Qatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export default function ReconciliationPage() {
  const organizationId = selectedOrganization();
  const [me, setMe] = useState<CurrentUser>();
  const [membership, setMembership] = useState<Membership>();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [date, setDate] = useState(todayQatar);
  const [report, setReport] = useState<Daily>();
  const [message, setMessage] = useState("");
  const canApprove =
    membership?.permissions.includes("reconciliation.approve") ?? false;
  useEffect(() => {
    if (!organizationId) return;
    void Promise.all([
      api<CurrentUser>("/auth/me"),
      api<Branch[]>(`/organizations/${organizationId}/branches`),
    ])
      .then(([user, branchRows]) => {
        const member = user.memberships.find(
          (row) => row.organizationId === organizationId,
        );
        setMe(user);
        setMembership(member);
        setBranches(branchRows);
        setBranchId(member?.branchId ?? branchRows[0]?.id ?? "");
      })
      .catch((error) =>
        setMessage(
          error instanceof Error ? error.message : "Unable to load cash-up.",
        ),
      );
  }, [organizationId]);
  useEffect(() => {
    if (!organizationId || (!branchId && !canApprove)) return;
    void load();
  }, [organizationId, branchId, date, canApprove]);
  async function load() {
    if (!organizationId) return;
    try {
      setReport(
        await api<Daily>(
          `/organizations/${organizationId}/reconciliations/daily?date=${date}${branchId ? `&branchId=${branchId}` : ""}`,
        ),
      );
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load reconciliation.",
      );
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const data = new FormData(event.currentTarget);
    try {
      await api(`/organizations/${organizationId}/reconciliations`, {
        method: "POST",
        body: JSON.stringify({
          date,
          branchId,
          countedCashMinor: Math.round(Number(data.get("countedCash")) * 100),
          notes: String(data.get("notes") ?? "") || null,
        }),
      });
      setMessage("Cash-up submitted to branch management.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Submission failed.");
    }
  }
  async function approve(id: string) {
    if (!organizationId) return;
    await api(
      `/organizations/${organizationId}/reconciliations/${id}/approve`,
      { method: "PATCH" },
    );
    setMessage(
      "Reconciliation approved and available to head-office reporting.",
    );
    await load();
  }
  const own = report?.rows.find((row) => row.cashierId === me?.id);
  return (
    <AppShell title="End-of-day reconciliation">
      <section className="card reconciliation-hero">
        <span className="eyebrow">Cash control · Qatar business day</span>
        <h2>Daily branch cash-up</h2>
        <div className="form-grid">
          <label>
            Business date
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label>
            Branch
            <select
              value={branchId}
              disabled={Boolean(membership?.branchId)}
              onChange={(event) => setBranchId(event.target.value)}
            >
              {!membership?.branchId && canApprove && (
                <option value="">All branches · head office</option>
              )}
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {report && (
          <div className="context-grid reconciliation-totals">
            <div>
              <small>Total sales</small>
              <strong>
                {formatMinorCurrency(report.aggregate.totalSalesMinor)}
              </strong>
            </div>
            <div>
              <small>Expected cash</small>
              <strong>
                {formatMinorCurrency(report.aggregate.expectedCashMinor)}
              </strong>
            </div>
            <div>
              <small>Local cards</small>
              <strong>
                {formatMinorCurrency(report.aggregate.cardSalesMinor)}
              </strong>
            </div>
            <div>
              <small>Credit sales</small>
              <strong>
                {formatMinorCurrency(report.aggregate.creditSalesMinor)}
              </strong>
            </div>
            <div>
              <small>Transactions</small>
              <strong>{report.aggregate.transactionCount}</strong>
            </div>
            <div>
              <small>Submitted</small>
              <strong>
                {report.aggregate.submittedCount}/{report.rows.length}
              </strong>
            </div>
          </div>
        )}
      </section>
      {membership?.permissions.includes("reconciliation.submit") &&
        branchId && (
          <section className="card">
            <h2>My cashier declaration</h2>
            <p className="muted">
              System cash:{" "}
              <strong>
                {formatMinorCurrency(own?.expectedCashMinor ?? 0)}
              </strong>
              . Count the physical drawer after returning customer change.
            </p>
            <form className="form compact" onSubmit={submit}>
              <div className="form-grid">
                <label>
                  Counted cash (QAR)
                  <input
                    name="countedCash"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={
                      own?.countedCashMinor == null
                        ? ""
                        : (own.countedCashMinor / 100).toFixed(2)
                    }
                    required
                  />
                </label>
                <label>
                  Cashier note
                  <textarea
                    name="notes"
                    defaultValue={own?.notes ?? ""}
                    placeholder="Explain any difference"
                  />
                </label>
              </div>
              <button>Submit end-of-day cash-up</button>
            </form>
          </section>
        )}
      <section className="card">
        <h2>Cashier reconciliation register</h2>
        <div className="table-list">
          {report?.rows.map((row) => (
            <div
              className="table-row reconciliation-row"
              key={`${row.branchId}:${row.cashierId}`}
            >
              <div>
                <strong>{row.cashierName}</strong>
                <small>
                  {row.employeeNumber ?? "Staff"} · {row.branchName} ·{" "}
                  {row.transactionCount} transactions
                </small>
              </div>
              <div>
                <small>Sales</small>
                <strong>{formatMinorCurrency(row.totalSalesMinor)}</strong>
              </div>
              <div>
                <small>Expected cash</small>
                <strong>{formatMinorCurrency(row.expectedCashMinor)}</strong>
              </div>
              <div>
                <small>Counted</small>
                <strong>
                  {row.countedCashMinor == null
                    ? "Pending"
                    : formatMinorCurrency(row.countedCashMinor)}
                </strong>
              </div>
              <div>
                <small>Variance</small>
                <strong
                  className={(row.varianceMinor ?? 0) === 0 ? "" : "error"}
                >
                  {row.varianceMinor == null
                    ? "—"
                    : formatMinorCurrency(row.varianceMinor)}
                </strong>
              </div>
              <span className="pill">{row.status}</span>
              {canApprove &&
                row.reconciliationId &&
                row.status === "SUBMITTED" && (
                  <button
                    className="secondary"
                    onClick={() => void approve(row.reconciliationId!)}
                  >
                    Approve
                  </button>
                )}
            </div>
          ))}
        </div>
        {!report?.rows.length && (
          <p className="muted">No completed sales for this branch and date.</p>
        )}
        {message && <p className="notice">{message}</p>}
      </section>
    </AppShell>
  );
}
