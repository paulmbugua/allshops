"use client";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../../components/app-shell";
import { api, selectedOrganization } from "../../lib/api";
import {
  getOfflineMetadata,
  replaceBootstrap,
  setOfflineMetadata,
} from "../../lib/offline-db";

type Branch = { id: string; name: string };
type Device = {
  id: string;
  name: string;
  status: string;
  lastSyncAt?: string | null;
  branch: { name: string };
  _count: { offlineTransactions: number };
};

export default function DevicesPage() {
  const organizationId = selectedOrganization();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [branchId, setBranchId] = useState("");
  const [name, setName] = useState("This POS");
  const [message, setMessage] = useState("");
  async function load() {
    if (!organizationId) return;
    const [nextBranches, nextDevices] = await Promise.all([
      api<Branch[]>(`/organizations/${organizationId}/branches`),
      api<Device[]>(`/organizations/${organizationId}/devices`),
    ]);
    setBranches(nextBranches);
    setBranchId((current) => current || nextBranches[0]?.id || "");
    setDevices(nextDevices);
  }
  useEffect(() => {
    void load().catch((error) =>
      setMessage(
        error instanceof Error ? error.message : "Unable to load devices.",
      ),
    );
  }, [organizationId]);
  async function register(event: FormEvent) {
    event.preventDefault();
    if (!organizationId || !branchId) return;
    try {
      const identifier = await setOrReadIdentifier();
      const device = await api<Device>(
        `/organizations/${organizationId}/devices/register`,
        {
          method: "POST",
          body: JSON.stringify({
            branchId,
            name,
            deviceIdentifier: identifier,
          }),
        },
      );
      const bootstrap = await api<Parameters<typeof replaceBootstrap>[0]>(
        `/organizations/${organizationId}/sync/bootstrap?deviceId=${device.id}`,
      );
      await replaceBootstrap(bootstrap);
      await setOfflineMetadata("device", {
        organizationId,
        branchId,
        deviceId: device.id,
        deviceIdentifier: identifier,
        bootstrappedAt: new Date().toISOString(),
      });
      setMessage(
        "Offline Ready — catalogue and stock snapshot saved on this device.",
      );
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Device registration failed.",
      );
    }
  }
  async function setOrReadIdentifier() {
    let identifier = await getOfflineMetadata<string>("deviceIdentifier");
    if (!identifier) {
      identifier = crypto.randomUUID();
      await setOfflineMetadata("deviceIdentifier", identifier);
    }
    return identifier;
  }
  async function revoke(id: string) {
    if (!organizationId) return;
    await api(`/organizations/${organizationId}/devices/${id}/revoke`, {
      method: "POST",
    });
    await load();
  }
  async function rename(device: Device) {
    if (!organizationId) return;
    const next = window.prompt("Device name", device.name)?.trim();
    if (!next || next === device.name) return;
    await api(`/organizations/${organizationId}/devices/${device.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: next }),
    });
    await load();
  }
  return (
    <AppShell title="POS devices">
      <section className="card">
        <h2>Prepare this browser for offline sales</h2>
        <form className="toolbar" onSubmit={register}>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Device name"
          />
          <select
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
            aria-label="Device branch"
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          <button>Register and bootstrap</button>
        </form>
        {message && <p className="notice">{message}</p>}
      </section>
      <section className="card">
        <h2>Registered devices</h2>
        <div className="data-table">
          {devices.map((device) => (
            <div className="data-row" key={device.id}>
              <strong>{device.name}</strong>
              <span>{device.branch.name}</span>
              <span>{device.status}</span>
              <span>
                Last sync{" "}
                {device.lastSyncAt
                  ? new Date(device.lastSyncAt).toLocaleString()
                  : "Never"}
              </span>
              <span>{device._count.offlineTransactions} conflicts</span>
              {device.status === "ACTIVE" && (
                <span className="actions">
                  <button
                    className="secondary"
                    onClick={() => void rename(device)}
                  >
                    Rename
                  </button>
                  <button
                    className="secondary"
                    onClick={() => void revoke(device.id)}
                  >
                    Revoke
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
