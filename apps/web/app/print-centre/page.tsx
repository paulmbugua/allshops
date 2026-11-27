"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import { PdfActions } from "../components/pdf-actions";
import { Can } from "../components/permission-context";
import { api, selectedOrganization } from "../lib/api";

type PrintOption = {
  id: string;
  title: string;
  group: string;
  description: string;
  snapshot: boolean;
};
type Branch = { id: string; name: string };

export default function PrintCentrePage() {
  return (
    <AppShell title="Print Centre">
      <PrintCentre />
    </AppShell>
  );
}

function PrintCentre() {
  const organizationId = selectedOrganization();
  const base = `/organizations/${organizationId}`;
  const [options, setOptions] = useState<PrintOption[]>();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selected, setSelected] = useState("");
  const [branch, setBranch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!organizationId) return;
    const requested = new URLSearchParams(window.location.search).get("report");
    void api<PrintOption[]>(`${base}/reports/print-catalogue`)
      .then((reports) => {
        setOptions(reports);
        setSelected(
          reports.find((report) => report.id === requested)?.id ??
            reports.find((report) => report.id === "sales")?.id ??
            reports[0]?.id ??
            "",
        );
      })
      .catch((cause) =>
        setMessage(
          cause instanceof Error
            ? cause.message
            : "Unable to load printable reports.",
        ),
      );
    void api<Branch[]>(`${base}/branches`)
      .then(setBranches)
      .catch(() => undefined);
  }, [organizationId, base]);

  const report = options?.find((option) => option.id === selected);
  const invalidDates = Boolean(from && to && from > to && !report?.snapshot);
  const filters = new URLSearchParams();
  if (branch) filters.set("branchId", branch);
  if (!report?.snapshot) {
    if (from) filters.set("dateFrom", from);
    if (to) filters.set("dateTo", to);
  }
  const path = report ? `${base}/reports/print/${report.id}?${filters}` : "";

  return (
    <section className="print-centre">
      <div className="print-centre-intro">
        <p>
          Choose a report and its scope, then download an A4 PDF or open it to
          print.
        </p>
        <div className="actions">
          <Can permissions={["sale.read"]}>
            <Link className="button-link secondary" href="/sales">
              Sales receipts
            </Link>
          </Can>
          <Can permissions={["purchase.read"]}>
            <Link className="button-link secondary" href="/purchases">
              Purchase documents
            </Link>
          </Can>
        </div>
      </div>
      {message ? (
        <p className="error" role="alert">
          {message}
        </p>
      ) : !options ? (
        <p role="status">Loading printable reports…</p>
      ) : !options.length ? (
        <p>No printable reports are available for your role.</p>
      ) : (
        <div className="print-centre-layout">
          <div
            className="card print-centre-library"
            aria-label="Available reports"
          >
            {Array.from(new Set(options.map((option) => option.group))).map(
              (group) => (
                <section key={group}>
                  <h3>{group}</h3>
                  {options
                    .filter((option) => option.group === group)
                    .map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className="print-report-choice"
                        aria-pressed={option.id === selected}
                        onClick={() => setSelected(option.id)}
                      >
                        {option.title}
                      </button>
                    ))}
                </section>
              ),
            )}
          </div>
          {report && (
            <div className="card print-centre-document">
              <h3>{report.title}</h3>
              <p>{report.description}</p>
              <div className="form-grid">
                {branches.length > 1 && (
                  <label>
                    Branch
                    <select
                      value={branch}
                      onChange={(event) => setBranch(event.target.value)}
                    >
                      <option value="">All accessible branches</option>
                      {branches.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {!report.snapshot && (
                  <>
                    <label>
                      From
                      <input
                        type="date"
                        value={from}
                        onChange={(event) => setFrom(event.target.value)}
                      />
                    </label>
                    <label>
                      To
                      <input
                        type="date"
                        value={to}
                        onChange={(event) => setTo(event.target.value)}
                      />
                    </label>
                  </>
                )}
              </div>
              <p className="muted">
                {report.snapshot
                  ? "This report uses current balances."
                  : "Leave both dates blank for the last 30 days. Dates use Nairobi time."}
              </p>
              {invalidDates ? (
                <p className="error" role="alert">
                  The end date must be on or after the start date.
                </p>
              ) : (
                <PdfActions
                  key={path}
                  path={path}
                  filename={`allshops-${report.id}`}
                />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
