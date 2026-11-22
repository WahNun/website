/** Dive OS sandbox. The admin refuses any other Supabase project. */
export const DIVE_OS_SUPABASE_URL = "https://kbsgzykophfbqyfwrpsb.supabase.co";

/**
 * Publishable key for the sandbox. Prefer the env var; this fallback is the
 * same public key so a build without env still talks only to Dive OS.
 */
const DIVE_OS_PUBLISHABLE_KEY = "sb_publishable_0BN4eouRybW1z-9UHreocQ_H04atPVG";

export function supabaseUrl() {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  if (configured && configured !== DIVE_OS_SUPABASE_URL) {
    throw new Error("Dive OS is locked to the sandbox Supabase project.");
  }
  return DIVE_OS_SUPABASE_URL;
}

export function supabasePublishableKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    DIVE_OS_PUBLISHABLE_KEY
  );
}
