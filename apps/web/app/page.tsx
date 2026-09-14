"use client";

import Link from "next/link";
import { LanguageToggle } from "./components/language-toggle";
import { usePublicLocale } from "./lib/public-locale";
/* This project-owned editorial image is pre-compressed WebP. */
/* eslint-disable @next/next/no-img-element */

const copy = {
  en: {
    navigation: ["Why AllShops", "For your business", "Plans"],
    signIn: "Sign in",
    startFree: "Start free",
    kicker: "Built for ambitious businesses in Qatar",
    headline: "Your business,",
    headlineAccent: "in full colour.",
    lede: "A beautiful, brilliantly simple POS and business workspace for the way you sell, stock and grow.",
    trial: "Start your free trial",
    explore: "Explore the workspace",
    proof: "Made for the way Qatar trades",
    proofDetail: "QAR-ready · Arabic-friendly · human support",
    imageAlt: "Qatari retail professionals using a modern point of sale",
    imageCaption: "Designed around Qatar",
    todaySales: "TODAY'S SALES",
    weeklyGrowth: "↑ 18.4% this week",
    live: "Live",
    greeting: "GOOD MORNING, AISHA",
    selling: "What are we selling?",
    search: "⌕  Search products or scan barcode",
    previewCategories: ["All items", "Drinks", "Snacks", "Popular"],
    products: ["Berry blast", "Caramel latte", "Sea salt chips"],
    currentOrder: "Current order · 3 items",
    payNow: "Pay now",
    workspaceFor: "ONE WORKSPACE FOR",
    categories: [
      "Retail",
      "Minimarket",
      "Salon & services",
      "Auto spares",
      "Hardware",
      "Printing",
    ],
    advantage: "THE ALLSHOPS ADVANTAGE",
    tools: "Serious tools.",
    joyful: "Joyful to use.",
    toolsCopy:
      "We take the complexity out of running a business, so your team can focus on the moments that matter.",
    learnMore: "Learn more",
    features: [
      [
        "✦",
        "Checkout that feels effortless",
        "A fast, focused counter flow for cash and your local bank terminal.",
      ],
      [
        "◈",
        "Every branch in one view",
        "See stock, sales and performance across your Qatar operation.",
      ],
      [
        "⌁",
        "Ready when the Wi‑Fi isn't",
        "Keep selling with resilient offline POS and safe background sync.",
      ],
    ],
    nextChapter: "MADE FOR YOUR NEXT CHAPTER",
    firstSale: "From first sale",
    fullFlow: "to full flow.",
    businessCopy:
      "Start with a counter, grow into a team, and keep every moving part connected. AllShops gives owners the calm, clear view they need to make their next decision.",
    seeHow: "See how it works",
    ready: "READY WHEN YOU ARE",
    lighter: "Let's make business",
    lighterAccent: "feel lighter.",
    create: "Create your workspace",
    care: "Built with care for Qatar's businesses.",
    privacy: "Privacy",
    terms: "Terms",
    deletion: "Account deletion",
  },
  ar: {
    navigation: ["لماذا أول شوبس؟", "لنشاطك التجاري", "الباقات"],
    signIn: "تسجيل الدخول",
    startFree: "ابدأ مجاناً",
    kicker: "صُمم للأعمال الطموحة في قطر",
    headline: "أعمالك،",
    headlineAccent: "بكل ألوان النجاح.",
    lede: "نظام نقاط بيع ومساحة عمل جميلة وبسيطة، تساعدك على البيع وإدارة المخزون والنمو بثقة.",
    trial: "ابدأ تجربتك المجانية",
    explore: "استكشف مساحة العمل",
    proof: "مصمم لأسلوب التجارة في قطر",
    proofDetail: "بالريال القطري · واجهة عربية · دعم بشري",
    imageAlt: "محترفون قطريون يستخدمون نظام نقاط بيع حديثاً",
    imageCaption: "مصمم حول احتياجات قطر",
    todaySales: "مبيعات اليوم",
    weeklyGrowth: "↑ ١٨٫٤٪ هذا الأسبوع",
    live: "متصل",
    greeting: "صباح الخير، عائشة",
    selling: "ماذا سنبيع اليوم؟",
    search: "⌕  ابحث عن منتج أو امسح الباركود",
    previewCategories: ["كل المنتجات", "المشروبات", "الوجبات", "الأكثر طلباً"],
    products: ["مشروب التوت", "لاتيه الكراميل", "رقائق ملح البحر"],
    currentOrder: "الطلب الحالي · ٣ منتجات",
    payNow: "ادفع الآن",
    workspaceFor: "مساحة عمل واحدة لـ",
    categories: [
      "التجزئة",
      "البقالات",
      "الصالونات والخدمات",
      "قطع السيارات",
      "مواد البناء",
      "الطباعة",
    ],
    advantage: "مزايا أول شوبس",
    tools: "أدوات قوية.",
    joyful: "ومتعة في الاستخدام.",
    toolsCopy: "نبسّط إدارة الأعمال لتتفرغ أنت وفريقك للحظات التي تصنع الفرق.",
    learnMore: "اعرف المزيد",
    features: [
      [
        "✦",
        "دفع سريع بلا تعقيد",
        "واجهة كاشير مركّزة للنقد وأجهزة البنوك المحلية.",
      ],
      [
        "◈",
        "كل الفروع في شاشة واحدة",
        "تابع المخزون والمبيعات والأداء في جميع فروعك داخل قطر.",
      ],
      [
        "⌁",
        "جاهز حتى دون إنترنت",
        "واصل البيع مع وضع عدم الاتصال والمزامنة الآمنة عند عودة الشبكة.",
      ],
    ],
    nextChapter: "مصمم لخطوتك القادمة",
    firstSale: "من أول عملية بيع",
    fullFlow: "إلى إدارة متكاملة.",
    businessCopy:
      "ابدأ بمنفذ واحد، وكوّن فريقك، واربط كل تفاصيل عملك. يمنح أول شوبس أصحاب الأعمال رؤية واضحة وهادئة لاتخاذ القرار التالي.",
    seeHow: "شاهد كيف يعمل",
    ready: "نحن جاهزون عندما تكون جاهزاً",
    lighter: "لنجعل إدارة أعمالك",
    lighterAccent: "أخف وأسهل.",
    create: "أنشئ مساحة عملك",
    care: "صُمم بعناية لأعمال قطر.",
    privacy: "الخصوصية",
    terms: "الشروط",
    deletion: "حذف الحساب",
  },
} as const;

export default function HomePage() {
  const { locale, direction, setLocale } = usePublicLocale();
  const t = copy[locale];
  const arrow = locale === "ar" ? "↖" : "↗";
  const forward = locale === "ar" ? "←" : "→";
  return (
    <main className="landing-page" lang={locale} dir={direction}>
      <nav className="landing-nav">
        <Link href="/" className="landing-brand">
          <span>✦</span> AllShops
        </Link>
        <div className="landing-nav-links">
          <a href="#features">{t.navigation[0]}</a>
          <a href="#businesses">{t.navigation[1]}</a>
          <Link href="/pricing">{t.navigation[2]}</Link>
        </div>
        <div className="landing-actions">
          <LanguageToggle locale={locale} onChange={setLocale} />
          <Link href="/login" className="landing-login">
            {t.signIn}
          </Link>
          <Link href="/register" className="landing-button landing-button-dark">
            {t.startFree} <span>{arrow}</span>
          </Link>
        </div>
      </nav>
      <section className="landing-hero">
        <div className="hero-copy">
          <div className="hero-kicker">
            <span className="pulse-dot" /> {t.kicker}
          </div>
          <h1>
            {t.headline}
            <br />
            <em>{t.headlineAccent}</em>
          </h1>
          <p className="hero-lede">{t.lede}</p>
          <div className="hero-ctas">
            <Link
              href="/register"
              className="landing-button landing-button-coral"
            >
              {t.trial} <span>{arrow}</span>
            </Link>
            <Link href="/login" className="hero-text-link">
              {t.explore} <span>{forward}</span>
            </Link>
          </div>
          <div className="hero-proof">
            <div className="avatar-stack">
              <span>خ</span>
              <span>NR</span>
              <span>SA</span>
              <span>+</span>
            </div>
            <div>
              <strong>{t.proof}</strong>
              <small>{t.proofDetail}</small>
            </div>
          </div>
        </div>
        <div className="hero-visual">
          <div className="qatar-hero-frame">
            <img src="/images/qatar-commerce-hero.webp" alt={t.imageAlt} />
            <span className="qatar-hero-caption">{t.imageCaption}</span>
          </div>
          <div className="receipt-float">
            <small>{t.todaySales}</small>
            <strong>QAR 12,840</strong>
            <span>{t.weeklyGrowth}</span>
          </div>
          <div className="pos-preview-card">
            <div className="preview-top">
              <div className="mini-brand">
                <span>✦</span> AllShops
              </div>
              <span className="preview-status">
                <i /> {t.live}
              </span>
            </div>
            <div className="preview-body">
              <div className="preview-heading">
                <div>
                  <small>{t.greeting}</small>
                  <h3>{t.selling}</h3>
                </div>
                <span className="preview-avatar">ع</span>
              </div>
              <div className="preview-search">{t.search}</div>
              <div className="preview-categories">
                <b>{t.previewCategories[0]}</b>
                {t.previewCategories.slice(1).map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
              <div className="preview-products">
                {t.products.map((product, index) => (
                  <div key={product}>
                    <span
                      className={`product-art ${["art-pink", "art-yellow", "art-blue"][index]}`}
                    >
                      {["✦", "◒", "◆"][index]}
                    </span>
                    <b>{product}</b>
                    <small>QAR {["8.00", "14.00", "6.50"][index]}</small>
                  </div>
                ))}
              </div>
            </div>
            <div className="preview-cart">
              <div>
                <small>{t.currentOrder}</small>
                <strong>QAR 28.50</strong>
              </div>
              <button>
                {t.payNow} <span>{forward}</span>
              </button>
            </div>
          </div>
          <div className="sparkle sparkle-one">✦</div>
          <div className="sparkle sparkle-two">✦</div>
        </div>
      </section>
      <section className="trust-strip">
        <span>{t.workspaceFor}</span>
        {t.categories.map((category) => (
          <b key={category}>{category}</b>
        ))}
      </section>
      <section className="landing-section feature-section" id="features">
        <div className="section-intro">
          <div className="section-label">{t.advantage}</div>
          <h2>
            {t.tools}
            <br />
            <span>{t.joyful}</span>
          </h2>
          <p>{t.toolsCopy}</p>
        </div>
        <div className="feature-grid">
          {t.features.map(([icon, title, description]) => (
            <article className="feature-card" key={title}>
              <span className="feature-icon">{icon}</span>
              <h3>{title}</h3>
              <p>{description}</p>
              <Link href="/register">
                {t.learnMore} <span>{forward}</span>
              </Link>
            </article>
          ))}
        </div>
      </section>
      <section className="landing-section business-section" id="businesses">
        <div className="business-blob" />
        <div>
          <div className="section-label">{t.nextChapter}</div>
          <h2>
            {t.firstSale}
            <br />
            <span>{t.fullFlow}</span>
          </h2>
        </div>
        <div className="business-copy">
          <p>{t.businessCopy}</p>
          <Link href="/register" className="landing-button landing-button-dark">
            {t.seeHow} <span>{arrow}</span>
          </Link>
        </div>
      </section>
      <section className="landing-cta">
        <div>
          <span className="section-label">{t.ready}</span>
          <h2>
            {t.lighter}
            <br />
            <em>{t.lighterAccent}</em>
          </h2>
        </div>
        <Link href="/register" className="landing-button landing-button-light">
          {t.create} <span>{arrow}</span>
        </Link>
      </section>
      <footer className="landing-footer">
        <Link href="/" className="landing-brand">
          <span>✦</span> AllShops
        </Link>
        <span>{t.care}</span>
        <span>
          <Link href="/privacy">{t.privacy}</Link> ·{" "}
          <Link href="/terms">{t.terms}</Link> ·{" "}
          <Link href="/support/account-deletion">{t.deletion}</Link> · © 2026
          AllShops
        </span>
      </footer>
    </main>
  );
}
