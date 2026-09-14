"use client";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../../components/app-shell";
import { api, selectedOrganization } from "../../lib/api";
import type {
  Branch,
  Paged as CataloguePaged,
  Product,
} from "../../lib/catalogue";
import type { Availability, Staff } from "../../lib/phase5";

const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export default function StaffDetailPage() {
  const { id } = useParams<{ id: string }>();
  const organizationId = selectedOrganization();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [services, setServices] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [ranges, setRanges] = useState<Availability[]>([]);
  const [message, setMessage] = useState("");
  async function load() {
    if (!organizationId) return;
    try {
      const [profile, products, branchRows, availability] = await Promise.all([
        api<Staff>(`/organizations/${organizationId}/staff/${id}`),
        api<CataloguePaged<Product>>(
          `/organizations/${organizationId}/products?pageSize=100&type=SERVICE`,
        ),
        api<Branch[]>(`/organizations/${organizationId}/branches`),
        api<Availability[]>(
          `/organizations/${organizationId}/staff/${id}/availability`,
        ),
      ]);
      setStaff(profile);
      setServices(products.items);
      setBranches(branchRows);
      setRanges(availability);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load staff.",
      );
    }
  }
  useEffect(() => {
    void load();
  }, [organizationId, id]);
  async function addService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const data = new FormData(event.currentTarget);
    await api(`/organizations/${organizationId}/staff/${id}/services`, {
      method: "POST",
      body: JSON.stringify({ serviceProductId: data.get("serviceProductId") }),
    });
    event.currentTarget.reset();
    setMessage("Service capability saved.");
    await load();
  }
  async function addBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const data = new FormData(event.currentTarget);
    await api(`/organizations/${organizationId}/staff/${id}/branches`, {
      method: "POST",
      body: JSON.stringify({ branchId: data.get("branchId"), isPrimary: true }),
    });
    event.currentTarget.reset();
    setMessage("Branch assignment saved.");
    await load();
  }
  async function saveAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const data = new FormData(event.currentTarget);
    const next = {
      branchId: String(data.get("branchId")),
      dayOfWeek: Number(data.get("dayOfWeek")),
      startTime: String(data.get("startTime")),
      endTime: String(data.get("endTime")),
      isActive: true,
    };
    await api(`/organizations/${organizationId}/staff/${id}/availability`, {
      method: "PUT",
      body: JSON.stringify({
        ranges: [
          ...ranges.map(
            ({ branchId, dayOfWeek, startTime, endTime, isActive }) => ({
              branchId,
              dayOfWeek,
              startTime,
              endTime,
              isActive,
            }),
          ),
          next,
        ],
      }),
    });
    setMessage("Availability saved.");
    await load();
  }
  return (
    <AppShell title={staff?.displayName ?? "Staff profile"}>
      {message && <p className="notice">{message}</p>}
      <div className="two-column">
        <section className="card">
          <h2>Profile</h2>
          <p>{staff?.jobTitle ?? "No job title"}</p>
          <p>{staff?.phone ?? staff?.email ?? "No contact details"}</p>
          <p>{staff?.isBookable ? "Available for booking" : "Not bookable"}</p>
          <h2>Service capabilities</h2>
          <ul>
            {staff?.services?.map((row) => (
              <li key={row.id}>
                {row.serviceProduct?.name ?? row.serviceProductId}
              </li>
            ))}
          </ul>
          <form onSubmit={addService}>
            <select required name="serviceProductId">
              <option value="">Select service</option>
              {services.map((row) => (
                <option value={row.id} key={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
            <button>Add service</button>
          </form>
        </section>
        <section className="card">
          <h2>Branches</h2>
          <ul>
            {staff?.branches?.map((row) => (
              <li key={row.id}>{row.branch?.name ?? row.branchId}</li>
            ))}
          </ul>
          <form onSubmit={addBranch}>
            <select required name="branchId">
              <option value="">Select branch</option>
              {branches.map((row) => (
                <option value={row.id} key={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
            <button>Assign</button>
          </form>
          <h2>Weekly availability</h2>
          <ul>
            {ranges.map((row) => (
              <li key={row.id}>
                {days[row.dayOfWeek]} {row.startTime}–{row.endTime}
              </li>
            ))}
          </ul>
          <form className="stack" onSubmit={saveAvailability}>
            <select required name="branchId">
              <option value="">Branch</option>
              {branches.map((row) => (
                <option value={row.id} key={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
            <select name="dayOfWeek">
              {days.map((day, index) => (
                <option value={index} key={day}>
                  {day}
                </option>
              ))}
            </select>
            <input required name="startTime" type="time" defaultValue="09:00" />
            <input required name="endTime" type="time" defaultValue="17:00" />
            <button>Add hours</button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
