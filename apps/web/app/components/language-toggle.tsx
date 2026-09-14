"use client";

import type { PublicLocale } from "../lib/public-locale";

export function LanguageToggle({
  locale,
  onChange,
  inverse = false,
}: {
  locale: PublicLocale;
  onChange: (locale: PublicLocale) => void;
  inverse?: boolean;
}) {
  return (
    <div
      className={`language-toggle${inverse ? " language-toggle-inverse" : ""}`}
      role="group"
      aria-label={locale === "ar" ? "اختيار اللغة" : "Choose language"}
    >
      <span aria-hidden="true" className="language-globe">
        ◉
      </span>
      <button
        type="button"
        className={locale === "en" ? "active" : ""}
        aria-pressed={locale === "en"}
        onClick={() => onChange("en")}
      >
        EN
      </button>
      <button
        type="button"
        lang="ar"
        className={locale === "ar" ? "active" : ""}
        aria-pressed={locale === "ar"}
        onClick={() => onChange("ar")}
      >
        عربي
      </button>
    </div>
  );
}
