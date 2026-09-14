"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../components/app-shell";
import { api, selectedOrganization } from "../lib/api";
import type {
  Branch,
  Paged as CataloguePaged,
  Product,
} from "../lib/catalogue";
import type { Appointment, Paged, Staff } from "../lib/phase5";

export default function AppointmentsPage() {
  const organizationId = selectedOrganization();
  const [rows, setRows] = useState<Appointment[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [services, setServices] = useState<Product[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [branchId, setBranchId] = useState("");
  const [serviceProductId, setServiceProductId] = useState("");
  const [message, setMessage] = useState("");
  async function load() {
    if (!organizationId) return;
    try {
      const [appointments, branchRows, products] = await Promise.all([
        api<Paged<Appointment>>(
          `/organizations/${organizationId}/appointments?pageSize=100`,
        ),
        api<Branch[]>(`/organizations/${organizationId}/branches`),
        api<CataloguePaged<Product>>(
          `/organizations/${organizationId}/products?pageSize=100&type=SERVICE`,
        ),
      ]);
      setRows(appointments.items);
      setBranches(branchRows);
      setServices(products.items);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load appointments.",
      );
    }
  }
  useEffect(() => {
    void load();
  }, [organizationId]);
  useEffect(() => {
    if (!organizationId || !branchId || !serviceProductId) {
      setStaff([]);
      return;
    }
    void api<Paged<Staff>>(
      `/organizations/${organizationId}/staff?pageSize=100&isActive=true&branchId=${branchId}&serviceProductId=${serviceProductId}`,
    )
      .then((result) => setStaff(result.items))
      .catch((error: Error) => setMessage(error.message));
  }, [organizationId, branchId, serviceProductId]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const data = new FormData(event.currentTarget);
    const staffProfileId = String(data.get("staffProfileId"));
    try {
      await api(`/organizations/${organizationId}/appointments`, {
        method: "POST",
        body: JSON.stringify({
          branchId: data.get("branchId"),
          customerName: data.get("customerName"),
          primaryStaffProfileId: staffProfileId,
          startAt: new Date(String(data.get("startAt"))).toISOString(),
          services: [
            { serviceProductId: data.get("serviceProductId"), staffProfileId },
          ],
        }),
      });
      event.currentTarget.reset();
      setBranchId("");
      setServiceProductId("");
      setMessage("Appointment booked.");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to book appointment.",
      );
    }
  }
  return (
    <AppShell title="Appointments">
      <div className="two-column">
        <section className="card">
          <h2>Schedule</h2>
          {message && <p className="notice">{message}</p>}
          <div className="data-table">
            <strong>When</strong>
            <strong>Customer</strong>
            <strong>Service</strong>
            <strong>Staff</strong>
            <strong>Status</strong>
            {rows.map((row) => (
              <div className="data-row" key={row.id}>
                <Link href={`/appointments/${row.id}`}>
                  {new Date(row.startAt).toLocaleString()}
                </Link>
                <span>{row.customerNameSnapshot ?? "Walk-in"}</span>
                <span>
                  {row.services
                    .map((service) => service.serviceNameSnapshot)
                    .join(", ")}
                </span>
                <span>{row.primaryStaff.displayName}</span>
                <span className="pill active">
                  {row.status.replaceAll("_", " ")}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <h2>Book appointment</h2>
          <form className="stack" onSubmit={create}>
            <label>
              Branch
              <select
                required
                name="branchId"
                value={branchId}
                onChange={(event) => setBranchId(event.target.value)}
              >
                <option value="">Select branch</option>
                {branches.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Customer name
              <input required name="customerName" />
            </label>
            <label>
              Service
              <select
                required
                name="serviceProductId"
                value={serviceProductId}
                onChange={(event) => setServiceProductId(event.target.value)}
              >
                <option value="">Select service</option>
                {services.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Staff
              <select required name="staffProfileId">
                <option value="">Select staff</option>
                {staff.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Start
              <input required name="startAt" type="datetime-local" />
            </label>
            <button>Book</button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
