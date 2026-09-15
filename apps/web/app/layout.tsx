import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./styles.css";
import { PwaRegistration } from "./components/pwa-registration";
import { LanguageProvider } from "./components/language-provider";

export const metadata: Metadata = {
  metadataBase: new URL("https://allshops.ekazi.co.ke"),
  title: "AllShops · Business workspace",
  description: "Qatar-first multi-tenant business operating platform.",
  applicationName: "AllShops POS",
  alternates: { canonical: "/" },
  openGraph: {
    title: "AllShops · Business workspace",
    description: "Modern POS and business operations for ambitious teams.",
    url: "https://allshops.ekazi.co.ke",
    siteName: "AllShops",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <PwaRegistration />
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
