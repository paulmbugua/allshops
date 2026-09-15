"use client";
/* Uploaded logos are normalized to bounded WebP files by the API. */
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { LanguageToggle } from "../components/language-toggle";
import { api, selectOrganization } from "../lib/api";
import { usePublicLocale } from "../lib/public-locale";

type Welcome = {
  id: string;
  name: string;
  arabicName: string | null;
  logoUrl: string | null;
  welcomeHeadline: string | null;
  tagline: string | null;
  motto: string | null;
  welcomeMessage: string | null;
  brandPrimaryColor: string;
  brandAccentColor: string;
  phone: string | null;
  email: string | null;
};

const copy = {
  en: {
    preparing: "Preparing your shop…",
    choose: "Choose a shop by signing in first.",
    unavailable: "Shop unavailable.",
    staff: "Staff sign in",
    visit: "Visit AllShops",
    powered: "Powered by AllShops",
    kicker: "WELCOME TO",
    tagline: "Beautiful service. Brilliantly simple.",
    ready: "Ready to serve you",
    secure: "Secure business workspace",
    imageAlt: "Qatari professionals in a contemporary shop",
  },
  ar: {
    preparing: "نجهّز متجرك…",
    choose: "سجّل الدخول أولاً لاختيار المتجر.",
    unavailable: "المتجر غير متاح حالياً.",
    staff: "دخول الموظفين",
    visit: "زيارة أول شوبس",
    powered: "بدعم من أول شوبس",
    kicker: "أهلاً وسهلاً بكم في",
    tagline: "خدمة جميلة، ببساطة متقنة.",
    ready: "جاهزون لخدمتكم",
    secure: "مساحة عمل آمنة لأعمالك",
    imageAlt: "محترفون قطريون في متجر عصري",
  },
} as const;

export default function ShopWelcomePage() {
  const { locale, direction, setLocale } = usePublicLocale();
  const t = copy[locale];
  const [shop, setShop] = useState<Welcome>();
  const [status, setStatus] = useState<"preparing" | "choose" | "unavailable">(
    "preparing",
  );
  useEffect(() => {
    const id =
      new URLSearchParams(window.location.search).get("organization") ??
      window.localStorage.getItem("allshops_last_organization");
    if (!id) {
      setStatus("choose");
      return;
    }
    selectOrganization(id);
    void api<Welcome>(`/organizations/${id}/welcome`)
      .then(setShop)
      .catch(() => setStatus("unavailable"));
  }, []);

  if (!shop) {
    return (
      <main
        className="shop-welcome-empty"
        lang={locale}
        dir={direction}
        data-manual-locale
      >
        <LanguageToggle locale={locale} onChange={setLocale} inverse />
        <div>
          <span className="welcome-spark">✦</span>
          <p>{t[status]}</p>
          <Link href="/login">{t.staff}</Link>
          <Link href="/">{t.visit}</Link>
        </div>
      </main>
    );
  }
  const theme = {
    "--shop-primary": shop.brandPrimaryColor,
    "--shop-accent": shop.brandAccentColor,
  } as CSSProperties;
  const displayName =
    locale === "ar" ? (shop.arabicName ?? shop.name) : shop.name;
  const headline =
    locale === "ar" ? displayName : (shop.welcomeHeadline ?? shop.name);
  const arrow = locale === "ar" ? "←" : "→";
  return (
    <main
      className="shop-welcome"
      style={theme}
      lang={locale}
      dir={direction}
      data-manual-locale
    >
      <img
        className="shop-cultural-photo"
        src="/images/qatar-commerce-hero.webp"
        alt={t.imageAlt}
      />
      <div className="shop-orb shop-orb-one" />
      <div className="shop-orb shop-orb-two" />
      <nav className="shop-welcome-nav">
        <div className="shop-identity">
          {shop.logoUrl ? (
            <img src={shop.logoUrl} alt={`${displayName} logo`} />
          ) : (
            <span>{shop.name.slice(0, 2).toUpperCase()}</span>
          )}
          <div>
            <strong>{displayName}</strong>
            {shop.arabicName && locale === "en" && (
              <small lang="ar" dir="rtl">
                {shop.arabicName}
              </small>
            )}
          </div>
        </div>
        <div className="shop-welcome-actions">
          <LanguageToggle locale={locale} onChange={setLocale} inverse />
          <Link href="/" className="shop-platform-link">
            {t.powered} ↗
          </Link>
        </div>
      </nav>
      <section className="shop-welcome-hero">
        <p className="shop-welcome-kicker">{t.kicker}</p>
        <h1 dir="auto">{headline}</h1>
        <p className="shop-tagline" dir="auto">
          {locale === "ar" ? t.tagline : (shop.tagline ?? t.tagline)}
        </p>
        {shop.welcomeMessage && locale === "en" && (
          <p className="shop-message" dir="auto">
            {shop.welcomeMessage}
          </p>
        )}
        <Link
          className="shop-enter"
          href={`/login?organization=${encodeURIComponent(shop.id)}`}
        >
          {t.staff} <span>{arrow}</span>
        </Link>
        {shop.motto && locale === "en" && (
          <blockquote dir="auto">“{shop.motto}”</blockquote>
        )}
      </section>
      <footer className="shop-welcome-footer">
        <span>{shop.phone ?? shop.email ?? t.ready}</span>
        <span>{t.secure}</span>
      </footer>
    </main>
  );
}
