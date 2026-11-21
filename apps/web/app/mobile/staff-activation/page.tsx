"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

function Fallback() {
  const token = useSearchParams().get("token") ?? "";
  useEffect(() => {
    const encoded = encodeURIComponent(token);
    window.location.href = `allshops://account/staff-activation?token=${encoded}`;
    const fallback = window.setTimeout(
      () => window.location.replace(`/staff-activation?token=${encoded}`),
      1400,
    );
    return () => window.clearTimeout(fallback);
  }, [token]);
  return (
    <main className="auth-page">
      <p>Opening account activation…</p>
    </main>
  );
}

export default function MobileStaffActivationFallback() {
  return (
    <Suspense>
      <Fallback />
    </Suspense>
  );
}
