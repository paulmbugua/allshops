import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./styles.css";
import { PwaRegistration } from "./components/pwa-registration";
import { LanguageProvider } from "./components/language-provider";

export const metadata: Metadata = {
  metadataBase: new URL("https://allshopspos.com"),
  title: "AllShops · POS + ERP workspace",
  description: "Kenya-ready multi-tenant POS and ERP business platform.",
  applicationName: "AllShops POS + ERP",
  alternates: { canonical: "/" },
  openGraph: {
    title: "AllShops · POS + ERP workspace",
    description:
      "Kenya-ready sales, inventory and business operations for ambitious teams.",
    url: "https://allshopspos.com",
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
