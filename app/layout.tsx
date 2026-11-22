import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { getSiteUrl, site } from "@/lib/site";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: `${site.title} — ${site.name}`,
    template: `%s — ${site.name}`,
  },
  description: site.description,
  openGraph: {
    title: `${site.title} — ${site.name}`,
    description: site.description,
    locale: "en_GB",
    type: "website",
    siteName: site.name,
  },
};

export const viewport: Viewport = {
  themeColor: "#090909",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body className={outfit.className}>{children}</body>
    </html>
  );
}
