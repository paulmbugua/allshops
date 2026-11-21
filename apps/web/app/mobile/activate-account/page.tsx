"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

function Fallback() {
  const token = useSearchParams().get("token") ?? "";
  useEffect(() => {
    const encoded = encodeURIComponent(token);
    window.location.href = `allshops://account/activate-account?token=${encoded}`;
    const fallback = window.setTimeout(
      () => window.location.replace(`/activate-account?token=${encoded}`),
      1400,
    );
    return () => window.clearTimeout(fallback);
  }, [token]);
  return (
    <main className="auth-page">
      <p>Opening email verification…</p>
    </main>
  );
}

export default function MobileAccountActivationFallback() {
  return (
    <Suspense>
      <Fallback />
    </Suspense>
  );
}
