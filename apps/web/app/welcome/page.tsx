"use client";
/* Uploaded logos are normalized to bounded WebP files by the API. */
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { api, selectOrganization } from "../lib/api";

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

export default function ShopWelcomePage() {
  const [shop, setShop] = useState<Welcome>();
  const [message, setMessage] = useState("Preparing your shop…");
  useEffect(() => {
    const id =
      new URLSearchParams(window.location.search).get("organization") ??
      window.localStorage.getItem("allshops_last_organization");
    if (!id) {
      setMessage("Choose a shop by signing in first.");
      return;
    }
    selectOrganization(id);
    void api<Welcome>(`/organizations/${id}/welcome`)
      .then(setShop)
      .catch((error) =>
        setMessage(
          error instanceof Error ? error.message : "Shop unavailable.",
        ),
      );
  }, []);
  if (!shop)
    return (
      <main className="shop-welcome-empty">
        <div>
          <span className="welcome-spark">✦</span>
          <p>{message}</p>
          <Link href="/login">Staff sign in</Link>
          <Link href="/">Visit AllShops</Link>
        </div>
      </main>
    );
  const theme = {
    "--shop-primary": shop.brandPrimaryColor,
    "--shop-accent": shop.brandAccentColor,
  } as CSSProperties;
  return (
    <main className="shop-welcome" style={theme}>
      <div className="shop-orb shop-orb-one" />
      <div className="shop-orb shop-orb-two" />
      <nav className="shop-welcome-nav">
        <div className="shop-identity">
          {shop.logoUrl ? (
            <img src={shop.logoUrl} alt={`${shop.name} logo`} />
          ) : (
            <span>{shop.name.slice(0, 2).toUpperCase()}</span>
          )}
          <div>
            <strong>{shop.name}</strong>
            {shop.arabicName && <small lang="ar">{shop.arabicName}</small>}
          </div>
        </div>
        <Link href="/" className="shop-platform-link">
          Powered by AllShops ↗
        </Link>
      </nav>
      <section className="shop-welcome-hero">
        <p className="shop-welcome-kicker">WELCOME TO</p>
        <h1>{shop.welcomeHeadline ?? shop.name}</h1>
        <p className="shop-tagline">
          {shop.tagline ?? "Beautiful service. Brilliantly simple."}
        </p>
        {shop.welcomeMessage && (
          <p className="shop-message">{shop.welcomeMessage}</p>
        )}
        <Link
          className="shop-enter"
          href={`/login?organization=${encodeURIComponent(shop.id)}`}
        >
          Staff sign in <span>→</span>
        </Link>
        {shop.motto && <blockquote>“{shop.motto}”</blockquote>}
      </section>
      <footer className="shop-welcome-footer">
        <span>{shop.phone ?? shop.email ?? "Ready to serve you"}</span>
        <span>Secure business workspace</span>
      </footer>
    </main>
  );
}
