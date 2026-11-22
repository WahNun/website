"use client";

import { useParams } from "next/navigation";
import { PageMembers } from "@/components/pages/Members";
import { useLang } from "@/lib/useLang";

const SLUGS: Record<string, string> = {
 dashboard: "overview",
 frontoffice: "front-office",
 finances: "finances",
 aisupport: "ai-support",
 schedule: "schedule",
 profiles: "staff",
 myprofile: "my-profile",
 knowledgebase: "knowledge-base",
 diagnostics: "diagnostics",
 marketing: "marketing",
 boatmanagement: "boat-management",
 testing: "testing",
 settings: "settings",
};

export default function DiveOsSection() {
 const params = useParams();
 const slug = String(params.slug ?? "overview");
 const lang = useLang();
 const nav = (page: string) => {
 if (page === "home") {
 window.location.href = "/";
 return;
 }
 window.location.href = "/dive-os/" + (SLUGS[page] ?? "overview");
 };
 return <PageMembers lang={lang} nav={nav} initialSlug={slug} />;
}
