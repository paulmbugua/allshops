"use client";

import { useEffect, useState } from "react";

export type PublicLocale = "en" | "ar";

const STORAGE_KEY = "allshops_public_language";

export function usePublicLocale() {
  const [locale, setLocaleState] = useState<PublicLocale>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "ar" || saved === "en") {
      setLocaleState(saved);
      return;
    }
    if (window.navigator.language.toLowerCase().startsWith("ar")) {
      setLocaleState("ar");
    }
  }, []);

  function setLocale(next: PublicLocale) {
    window.localStorage.setItem(STORAGE_KEY, next);
    setLocaleState(next);
  }

  return {
    locale,
    direction: locale === "ar" ? ("rtl" as const) : ("ltr" as const),
    setLocale,
  };
}
