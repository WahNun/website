/**
 * Online-Buchungsmodus (Lucas 28.10.2026, Low Season):
 *   'open'    — wie bisher: Gast zahlt sofort per Stripe, Buchung entsteht im Webhook.
 *   'request' — Gast sendet eine Anfrage; Buchung entsteht sofort als pending (hält keinen Platz),
 *               das Team gibt frei (Approve) und schickt den Zahlungslink.
 *
 * Quelle ist site_settings.booking_mode. Der Server liest IMMER direkt aus der Tabelle (kein 60-s-Cache),
 * damit der Admin-Schalter sofort greift. Produkt-Regeln (course_prices.request_only) bleiben unberührt —
 * Folgearbeit, siehe CHANGELOG 28.10.
 */
import type { WindowRule } from '@/lib/bookingWindows'

export type BookingMode = 'open' | 'request'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getBookingMode(supabase: any): Promise<BookingMode> {
  const { data, error } = await supabase.from('site_settings').select('value').eq('key', 'booking_mode').maybeSingle()
  if (error) console.warn('[bookingMode] read failed, falling back to open:', error.message)
  return data?.value === 'request' ? 'request' : 'open'
}

/** Gültigkeit einer Freigabe (Mail-Hinweis + FO-Anzeige). Kein Cron: nach Ablauf holt sich der Gast selbst einen neuen Link. */
export const REQUEST_APPROVAL_HOURS = 72
/** Stripe-Checkout-Session für Request-Zahlungslinks: 24 h (Stripe-Maximum). */
export const REQUEST_LINK_HOURS = 24

/** Aktive Buchungsfenster (Server, Service-Role). Nur die Felder, die die Auflösung braucht. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadBookingWindows(supabase: any): Promise<WindowRule[]> {
  const { data, error } = await supabase.from('booking_windows').select('id, from_date, to_date, mode, session, product_id, guest_text').eq('active', true)
  if (error) { console.warn('[bookingMode] booking_windows read failed (ignored):', error.message); return [] }
  return (data ?? []) as WindowRule[]
}

export function newRequestToken(): string {
  // 32 Hex-Zeichen aus crypto — Node 18+ (Vercel Runtime 'nodejs')
  const bytes = new Uint8Array(24)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}
