"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import { Can } from "../components/permission-context";
import { api, selectedOrganization } from "../lib/api";
import type { Paged, Staff } from "../lib/phase5";

export default function StaffPage() {
  const organizationId = selectedOrganization();
  const [rows, setRows] = useState<Staff[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!organizationId) return;
    void api<Paged<Staff>>(
      `/organizations/${organizationId}/staff?pageSize=100&search=${encodeURIComponent(search)}`,
    )
      .then((value) => setRows(value.items))
      .catch((error: Error) => setMessage(error.message));
  }, [organizationId, search]);
  return (
    <AppShell title="Staff">
      <section className="card">
        <div className="toolbar">
          <input
            placeholder="Search staff"
            aria-label="Search staff"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Can permissions={["staff.create"]}>
            <Link className="button-link" href="/staff/new">
              New staff member
            </Link>
          </Can>
        </div>
        {message && <p className="error">{message}</p>}
        <div className="data-table customer-table">
          <strong>Name</strong>
          <strong>Role</strong>
          <strong>Contact</strong>
          <strong>Booking</strong>
          <strong>Status</strong>
          <strong>Account</strong>
          {rows.map((row) => (
            <div className="data-row" key={row.id}>
              <Link href={`/staff/${row.id}`}>
                <b>{row.displayName}</b>
              </Link>
              <span>{row.jobTitle ?? "—"}</span>
              <span>{row.phone ?? row.email ?? "—"}</span>
              <span>{row.isBookable ? "Bookable" : "Not bookable"}</span>
              <span className={`pill ${row.isActive ? "active" : ""}`}>
                {row.isActive ? "Active" : "Inactive"}
              </span>
              <span>{row.user?.name ?? "Unlinked"}</span>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
