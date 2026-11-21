"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

function Fallback() {
  const token = useSearchParams().get("token") ?? "";
  useEffect(() => {
    const encoded = encodeURIComponent(token);
    window.location.href = `allshops://account/reset-password?token=${encoded}`;
    const fallback = window.setTimeout(
      () => window.location.replace(`/reset-password?token=${encoded}`),
      1400,
    );
    return () => window.clearTimeout(fallback);
  }, [token]);
  return (
    <main className="auth-page">
      <p>Opening password reset…</p>
    </main>
  );
}

export default function MobilePasswordResetFallback() {
  return (
    <Suspense>
      <Fallback />
    </Suspense>
  );
}
