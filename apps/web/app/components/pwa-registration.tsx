"use client";
import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    const isSecure =
      window.isSecureContext ||
      ["localhost", "127.0.0.1"].includes(location.hostname);
    if ("serviceWorker" in navigator && isSecure)
      void navigator.serviceWorker.register("/sw.js");
    if (process.env.NEXT_PUBLIC_APP_VERSION)
      console.info(
        `AllShops ${process.env.NEXT_PUBLIC_APP_VERSION} (${process.env.NEXT_PUBLIC_GIT_SHA ?? "unknown"})`,
      );
  }, []);
  return null;
}
