import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Dive OS",
    template: "%s — Dive OS",
  },
  description: "Private admin for dive centre software. Not for public use.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export const dynamic = "force-dynamic";

export default function DiveOsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
