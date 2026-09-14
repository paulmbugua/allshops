"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { Can } from "../../components/permission-context";
import { api, selectedOrganization } from "../../lib/api";
import { formatMinorCurrency } from "../../lib/catalogue";
import type { Appointment } from "../../lib/phase5";

export default function AppointmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const organizationId = selectedOrganization();
  const [row, setRow] = useState<Appointment | null>(null);
  const [message, setMessage] = useState("");
  async function load() {
    if (!organizationId) return;
    try {
      setRow(
        await api<Appointment>(
          `/organizations/${organizationId}/appointments/${id}`,
        ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load appointment.",
      );
    }
  }
  useEffect(() => {
    void load();
  }, [organizationId, id]);
  async function transition(action: string) {
    if (!organizationId) return;
    try {
      await api(
        `/organizations/${organizationId}/appointments/${id}/${action}`,
        {
          method: "POST",
          body:
            action === "cancel"
              ? JSON.stringify({ cancellationReason: "Cancelled by staff" })
              : undefined,
        },
      );
      setMessage(`Appointment ${action.replace("no-show", "marked no-show")}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
    }
  }
  return (
    <AppShell title="Appointment details">
      {message && <p className="notice">{message}</p>}
      {row && (
        <>
          <section className="card">
            <div className="toolbar">
              <div>
                <h2>{row.customerNameSnapshot ?? "Walk-in customer"}</h2>
                <p>
                  {new Date(row.startAt).toLocaleString()} · {row.branch.name}
                </p>
              </div>
              <span className="pill active">
                {row.status.replaceAll("_", " ")}
              </span>
            </div>
            <div className="toolbar">
              {row.status === "BOOKED" && (
                <Can permissions={["appointment.confirm"]}>
                  <button
                    className="secondary"
                    onClick={() => void transition("confirm")}
                  >
                    Confirm
                  </button>
                </Can>
              )}
              {row.status === "CONFIRMED" && (
                <Can permissions={["appointment.start"]}>
                  <button
                    className="secondary"
                    onClick={() => void transition("start")}
                  >
                    Start
                  </button>
                </Can>
              )}
              {row.status === "IN_PROGRESS" && (
                <Can permissions={["appointment.complete"]}>
                  <button onClick={() => void transition("complete")}>
                    Complete
                  </button>
                </Can>
              )}
              {["BOOKED", "CONFIRMED"].includes(row.status) && (
                <Can permissions={["appointment.no_show"]}>
                  <button
                    className="secondary"
                    onClick={() => void transition("no-show")}
                  >
                    No-show
                  </button>
                </Can>
              )}
              {["BOOKED", "CONFIRMED"].includes(row.status) && (
                <Can permissions={["appointment.cancel"]}>
                  <button
                    className="danger"
                    onClick={() => void transition("cancel")}
                  >
                    Cancel
                  </button>
                </Can>
              )}
              {row.status === "COMPLETED" && !row.sale && (
                <Can permissions={["appointment.checkout", "sale.create"]}>
                  <Link
                    className="button-link"
                    href={`/pos?appointmentId=${row.id}`}
                  >
                    Open in POS
                  </Link>
                </Can>
              )}
              {row.sale && (
                <Link className="button-link" href={`/sales/${row.sale.id}`}>
                  View sale
                </Link>
              )}
            </div>
          </section>
          <section className="card">
            <h2>Services</h2>
            <div className="data-table">
              <strong>Service</strong>
              <strong>Staff</strong>
              <strong>Duration</strong>
              <strong>Price</strong>
              {row.services.map((service) => (
                <div className="data-row" key={service.id}>
                  <span>{service.serviceNameSnapshot}</span>
                  <span>{service.staffProfile.displayName}</span>
                  <span>{service.durationMinutesSnapshot} min</span>
                  <b>{formatMinorCurrency(service.priceMinorSnapshot)}</b>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
