import type { NextConfig } from "next";
import path from "node:path";

const publicApiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";
const apiConnectSource = /^https?:\/\//.test(publicApiUrl)
  ? new URL(publicApiUrl).origin
  : "";
const productionCspSuffix =
  process.env.NODE_ENV === "production" ? "; upgrade-insecure-requests" : "";
const scriptPolicy = process.env.NODE_ENV === "production"
  ? "script-src 'self' 'unsafe-inline'"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

const nextConfig: NextConfig = {
  // Windows without Developer Mode cannot create Next's standalone symlink tree.
  // Container/release builds run on Linux and always produce the required artifact.
  output: process.platform === "win32" ? undefined : "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  experimental: {
    cpus: 1,
  },
  transpilePackages: ["@allshops/ui"],
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; ${scriptPolicy}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'${apiConnectSource ? ` ${apiConnectSource}` : ""}; worker-src 'self' blob:; manifest-src 'self'${productionCspSuffix}`,
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
