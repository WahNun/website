"use client";

import { supabase } from "@/components/pages/_shared";

/** Stored in site_settings. Public read, no schema change. */
export const BRAND_KEYS = {
  name: "centre_name",
  logoUrl: "centre_logo_url",
  email: "centre_email",
  phone: "centre_phone",
  address: "centre_address",
  intro: "centre_intro",
} as const;

export type CentreBrand = {
  name: string;
  logoUrl: string;
  email: string;
  phone: string;
  address: string;
  intro: string;
};

export const DEFAULT_BRAND: CentreBrand = {
  name: "Dive centre",
  logoUrl: "",
  email: "",
  phone: "",
  address: "",
  intro: "Choose a trip, pick a time, and send a booking.",
};

export async function loadCentreBrand(): Promise<CentreBrand> {
  const keys = Object.values(BRAND_KEYS);
  const { data, error } = await supabase.from("site_settings").select("key,value").in("key", keys);
  if (error || !data) return DEFAULT_BRAND;
  const map = new Map(data.map((row) => [row.key as string, String(row.value ?? "")]));
  return {
    name: map.get(BRAND_KEYS.name)?.trim() || DEFAULT_BRAND.name,
    logoUrl: map.get(BRAND_KEYS.logoUrl)?.trim() || "",
    email: map.get(BRAND_KEYS.email)?.trim() || "",
    phone: map.get(BRAND_KEYS.phone)?.trim() || "",
    address: map.get(BRAND_KEYS.address)?.trim() || "",
    intro: map.get(BRAND_KEYS.intro)?.trim() || DEFAULT_BRAND.intro,
  };
}
