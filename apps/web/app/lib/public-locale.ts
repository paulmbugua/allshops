"use client";

import { useEffect, useState } from "react";

export type PublicLocale = "en" | "sw";

// Public and authenticated surfaces intentionally share one preference. A
// language selected before sign-in must follow the user into the workspace.
export const DISPLAY_LANGUAGE_KEY = "allshops_display_language";
export const DISPLAY_LANGUAGE_EVENT = "allshops:language-change";

export function usePublicLocale() {
  const [locale, setLocaleState] = useState<PublicLocale>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem(DISPLAY_LANGUAGE_KEY);
    if (saved === "sw" || saved === "en") {
      setLocaleState(saved);
      return;
    }
    if (window.navigator.language.toLowerCase().startsWith("sw")) {
      setLocaleState("sw");
    }
  }, []);

  function setLocale(next: PublicLocale) {
    window.localStorage.setItem(DISPLAY_LANGUAGE_KEY, next);
    window.dispatchEvent(
      new CustomEvent(DISPLAY_LANGUAGE_EVENT, { detail: next }),
    );
    setLocaleState(next);
  }

  return {
    locale,
    direction: "ltr" as const,
    setLocale,
  };
}
