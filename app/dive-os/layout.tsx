import type { Metadata } from "next";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./dive-os.css";

export const metadata: Metadata = {
 title: {
 default: "Dive OS",
 template: "%s — Dive OS",
 },
 description: "Private dive centre admin. Not for public use.",
 robots: {
 index: false,
 follow: false,
 nocache: true,
 googleBot: { index: false, follow: false, noimageindex: true },
 },
};

export const dynamic = "force-dynamic";

export default function DiveOsLayout({ children }: { children: React.ReactNode }) {
 return (
 <div className="dive-os-root">
 {children}
 <ThemeToggle className="theme-dock" />
 </div>
 );
}
