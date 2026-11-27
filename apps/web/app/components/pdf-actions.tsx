"use client";

import { useState } from "react";
import { apiPdf } from "../lib/api";

export function PdfActions({
  path,
  filename,
  preview = true,
}: {
  path: string;
  filename: string;
  preview?: boolean;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function openPdf(view: boolean) {
    if (working) return;
    setError("");
    const tab = view ? window.open("about:blank", "_blank") : null;
    if (view && !tab) {
      setError("Allow pop-ups to preview the PDF, or choose Download PDF.");
      return;
    }
    if (tab) {
      tab.opener = null;
      tab.document.body.textContent = "Preparing your PDF…";
    }
    setWorking(true);
    try {
      const href = URL.createObjectURL(await apiPdf(path));
      if (tab) tab.location.replace(href);
      else {
        const link = document.createElement("a");
        link.href = href;
        link.download = `${filename.replace(/[^a-zA-Z0-9_-]/g, "-")}.pdf`;
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
    } catch (cause) {
      tab?.close();
      setError(
        cause instanceof Error ? cause.message : "Unable to prepare the PDF.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="print-hidden">
      <div className="actions">
        <button
          type="button"
          disabled={working}
          onClick={() => void openPdf(false)}
        >
          {working ? "Preparing…" : "Download PDF"}
        </button>
        {preview && (
          <button
            type="button"
            className="secondary"
            disabled={working}
            onClick={() => void openPdf(true)}
          >
            Preview &amp; print
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
