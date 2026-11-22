export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const raw =
    configured ||
    (vercel
      ? vercel.startsWith("http")
        ? vercel
        : `https://${vercel}`
      : "http://localhost:3000");
  return new URL(raw);
}

export const site = {
  name: "Lucas Wahnon",
  title: "Websites built for bookings and enquiries",
  description:
    "Lucas Wahnon designs and builds websites and the systems behind them for dive centres and local service businesses — bookings, daily operations and local visibility.",
};
