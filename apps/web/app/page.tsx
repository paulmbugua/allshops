import Link from "next/link";

const features = [
  {
    icon: "✦",
    title: "Checkout that feels effortless",
    copy: "A fast, focused counter flow for cash and your local bank terminal.",
  },
  {
    icon: "◈",
    title: "Every branch in one view",
    copy: "See stock, sales and performance across your Qatar operation.",
  },
  {
    icon: "⌁",
    title: "Ready when the Wi‑Fi isn't",
    copy: "Keep selling with resilient offline POS and safe background sync.",
  },
];
const categories = [
  "Retail",
  "Minimarket",
  "Salon & services",
  "Auto spares",
  "Hardware",
  "Printing",
];

export default function HomePage() {
  return (
    <main className="landing-page">
      <nav className="landing-nav">
        <Link href="/" className="landing-brand">
          <span>✦</span> AllShops
        </Link>
        <div className="landing-nav-links">
          <a href="#features">Why AllShops</a>
          <a href="#businesses">For your business</a>
          <Link href="/pricing">Plans</Link>
        </div>
        <div className="landing-actions">
          <Link href="/login" className="landing-login">
            Sign in
          </Link>
          <Link href="/register" className="landing-button landing-button-dark">
            Start free <span>↗</span>
          </Link>
        </div>
      </nav>
      <section className="landing-hero">
        <div className="hero-copy">
          <div className="hero-kicker">
            <span className="pulse-dot" /> Built for ambitious businesses in
            Qatar
          </div>
          <h1>
            Your business,
            <br />
            <em>in full colour.</em>
          </h1>
          <p className="hero-lede">
            A beautiful, brilliantly simple POS and business workspace for the
            way you sell, stock and grow.
          </p>
          <div className="hero-ctas">
            <Link
              href="/register"
              className="landing-button landing-button-coral"
            >
              Start your free trial <span>↗</span>
            </Link>
            <Link href="/login" className="hero-text-link">
              Explore the workspace <span>→</span>
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
              <strong>Made for the way Qatar trades</strong>
              <small>QAR-ready · Arabic-friendly · human support</small>
            </div>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-sun" />
          <div className="receipt-float">
            <small>TODAY&apos;S SALES</small>
            <strong>QAR 12,840</strong>
            <span>↑ 18.4% this week</span>
          </div>
          <div className="pos-preview-card">
            <div className="preview-top">
              <div className="mini-brand">
                <span>✦</span> AllShops
              </div>
              <span className="preview-status">
                <i /> Live
              </span>
            </div>
            <div className="preview-body">
              <div className="preview-heading">
                <div>
                  <small>GOOD MORNING, AISHA</small>
                  <h3>What are we selling?</h3>
                </div>
                <span className="preview-avatar">A</span>
              </div>
              <div className="preview-search">
                ⌕ &nbsp; Search products or scan barcode
              </div>
              <div className="preview-categories">
                <b>All items</b>
                <span>Drinks</span>
                <span>Snacks</span>
                <span>Popular</span>
              </div>
              <div className="preview-products">
                <div>
                  <span className="product-art art-pink">✦</span>
                  <b>Berry blast</b>
                  <small>QAR 8.00</small>
                </div>
                <div>
                  <span className="product-art art-yellow">◒</span>
                  <b>Caramel latte</b>
                  <small>QAR 14.00</small>
                </div>
                <div>
                  <span className="product-art art-blue">◆</span>
                  <b>Sea salt chips</b>
                  <small>QAR 6.50</small>
                </div>
              </div>
            </div>
            <div className="preview-cart">
              <div>
                <small>Current order · 3 items</small>
                <strong>QAR 28.50</strong>
              </div>
              <button>
                Pay now <span>→</span>
              </button>
            </div>
          </div>
          <div className="sparkle sparkle-one">✦</div>
          <div className="sparkle sparkle-two">✦</div>
        </div>
      </section>
      <section className="trust-strip">
        <span>ONE WORKSPACE FOR</span>
        {categories.map((category) => (
          <b key={category}>{category}</b>
        ))}
      </section>
      <section className="landing-section feature-section" id="features">
        <div className="section-intro">
          <div className="section-label">THE ALLSHOPS ADVANTAGE</div>
          <h2>
            Serious tools.
            <br />
            <span>Joyful to use.</span>
          </h2>
          <p>
            We take the complexity out of running a business, so your team can
            focus on the moments that matter.
          </p>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <span className="feature-icon">{feature.icon}</span>
              <h3>{feature.title}</h3>
              <p>{feature.copy}</p>
              <Link href="/register">
                Learn more <span>→</span>
              </Link>
            </article>
          ))}
        </div>
      </section>
      <section className="landing-section business-section" id="businesses">
        <div className="business-blob" />
        <div>
          <div className="section-label">MADE FOR YOUR NEXT CHAPTER</div>
          <h2>
            From first sale
            <br />
            to <span>full flow.</span>
          </h2>
        </div>
        <div className="business-copy">
          <p>
            Start with a counter, grow into a team, and keep every moving part
            connected. AllShops gives owners the calm, clear view they need to
            make their next decision.
          </p>
          <Link href="/register" className="landing-button landing-button-dark">
            See how it works <span>↗</span>
          </Link>
        </div>
      </section>
      <section className="landing-cta">
        <div>
          <span className="section-label">READY WHEN YOU ARE</span>
          <h2>
            Let&apos;s make business
            <br />
            <em>feel lighter.</em>
          </h2>
        </div>
        <Link href="/register" className="landing-button landing-button-light">
          Create your workspace <span>↗</span>
        </Link>
      </section>
      <footer className="landing-footer">
        <Link href="/" className="landing-brand">
          <span>✦</span> AllShops
        </Link>
        <span>Built with care for Qatar&apos;s businesses.</span>
        <span>
          <Link href="/privacy">Privacy</Link> ·{" "}
          <Link href="/terms">Terms</Link> ·{" "}
          <Link href="/support/account-deletion">Account deletion</Link> · ©
          2026 AllShops
        </span>
      </footer>
    </main>
  );
}
