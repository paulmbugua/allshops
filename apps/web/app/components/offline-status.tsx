"use client";
import { useEffect, useState } from "react";
import {
  getOfflineMetadata,
  pendingSales,
  type LocalOfflineSale,
} from "../lib/offline-db";
import { synchronizePending } from "../lib/sync-manager";

type DeviceMetadata = { organizationId: string; deviceId: string };

export function OfflineStatus() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const refresh = async () => {
      setOnline(navigator.onLine);
      const rows = await pendingSales().catch(() => [] as LocalOfflineSale[]);
      setPending(rows.filter((row) => row.status !== "SYNCED").length);
    };
    const reconnect = async () => {
      await refresh();
      const device = await getOfflineMetadata<DeviceMetadata>("device");
      if (device && navigator.onLine)
        await synchronizePending(device.organizationId, device.deviceId).catch(
          () => undefined,
        );
      await refresh();
    };
    void refresh();
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", refresh);
    const timer = window.setInterval(refresh, 15_000);
    return () => {
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", refresh);
      window.clearInterval(timer);
    };
  }, []);
  return (
    <span className={`pill ${online ? "active" : "warning"}`}>
      {online ? "Online" : "Offline"}
      {pending ? ` · ${pending} unsynced` : " · synchronized"}
    </span>
  );
}
