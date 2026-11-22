import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  return ["", "/dive-centres", "/local-services"].map((path) => ({
    url: new URL(path || "/", base).toString(),
    lastModified: new Date("2026-11-22"),
  }));
}
