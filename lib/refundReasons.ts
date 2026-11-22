/**
 * Pflicht-Gründe für Stornierungen und Refunds + Auszahlungsdaten bei Nicht-Stripe-Refunds.
 * Gleiche Listen im UI (Dropdown) und auf dem Server (Validierung), damit Claudia im Finances-Tab
 * immer weiß, warum ein Antrag da ist (Lucas 30.10.).
 */

export const CANCEL_REASONS = [
  'Weather / sea conditions',
  'Guest is sick or injured',
  'Guest changed plans',
  'Guest did not show up',
  'Booked by mistake / double booking',
  'Centre cancelled (boat, staff or equipment)',
  'Moved to another date',
  'Other',
] as const

export const REFUND_REASONS = [
  'Day cancelled',
  'Weather / sea conditions',
  'Guest is sick or injured',
  'Item not used (gear, extra, add-on)',
  'Package downgrade',
  'Insurance not needed',
  'Booked by mistake / double booking',
  'Price correction',
  'Goodwill / complaint',
  'Other',
] as const

export const MIN_REASON_DETAIL = 3

/** „Weather / sea conditions — Day 2 cancelled, wind 30 kn"; ohne Notiz nur der Grund. */
export function composeReason(choice: string, detail: string): string {
  const c = choice.trim()
  const d = detail.trim()
  return c && d ? `${c} — ${d}` : (c || d)
}

/** Grund aus der Liste reicht; nur bei „Other" ist eine Notiz Pflicht (Lucas 30.10.). */
export function reasonComplete(choice: string, detail: string): boolean {
  if (!choice.trim()) return false
  return choice.trim() !== 'Other' || detail.trim().length >= MIN_REASON_DETAIL
}

/** Fehlertext oder null. Erwartet das zusammengesetzte Ergebnis von composeReason. */
export function reasonError(full: string | null | undefined): string | null {
  const t = (full ?? '').trim()
  if (t.length < 3) return 'A reason is required: pick one from the list so Finances knows what this is for.'
  const [head, ...rest] = t.split(' — ')
  if (head.trim() === 'Other' && rest.join(' — ').trim().length < MIN_REASON_DETAIL) {
    return 'Reason "Other" needs a short note (at least 3 characters) saying what it is for.'
  }
  return null
}

// ── Auszahlungsdaten (nur Methoden ohne Stripe) ──────────────────────────────

export type PayoutMethod = 'bank' | 'revolut' | 'mb_way' | 'other' | 'cash' | 'stripe'

export function payoutNeeded(method: string): boolean {
  return method === 'bank' || method === 'revolut' || method === 'mb_way' || method === 'other'
}

export function normalizeIban(s: string): string {
  return s.replace(/\s+/g, '').toUpperCase()
}

/** IBAN-Prüfsumme (ISO 13616, mod 97). */
export function ibanValid(raw: string): boolean {
  const iban = normalizeIban(raw)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  const re = iban.slice(4) + iban.slice(0, 4)
  let rem = 0
  for (const ch of re) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)
    for (const d of v) rem = (rem * 10 + Number(d)) % 97
  }
  return rem === 1
}

/** Fehlertext oder null. `details` ist ein Freitext, den das UI aus den Feldern baut: „IBAN … · Holder …". */
export function payoutError(method: string, details: string | null | undefined): string | null {
  if (!payoutNeeded(method)) return null
  const t = (details ?? '').trim()
  if (!t) return `Payout details are required for ${method === 'bank' ? 'bank transfer' : method === 'mb_way' ? 'MB WAY' : method === 'revolut' ? 'Revolut' : 'this payout method'} — ask the guest where the money should go.`
  if (method === 'bank') {
    const m = t.match(/[A-Za-z]{2}\d{2}[A-Za-z0-9 ]{11,40}/)
    if (!m || !ibanValid(m[0])) return 'The IBAN is not valid — please check it again with the guest.'
    if (!/holder/i.test(t) || t.replace(/.*holder:?/i, '').trim().length < 3) return 'Account holder name is required for a bank transfer.'
  }
  if (method === 'mb_way' && t.replace(/\D/g, '').length < 9) return 'MB WAY needs the guest phone number.'
  if (method === 'revolut' && !(t.replace(/\D/g, '').length >= 9 || /@\w{3,}/.test(t))) return 'Revolut needs the guest phone number or @username.'
  if (method === 'other' && t.length < 5) return 'Describe how the money should be paid out.'
  return null
}

/** Nach der Auszahlung nur noch maskiert aufbewahren (PT50 … 1234). */
export function maskPayout(details: string | null | undefined): string | null {
  if (!details) return null
  return details
    .replace(/([A-Za-z]{2}\d{2})[A-Za-z0-9 ]{7,38}([A-Za-z0-9]{4})/g, '$1 … $2')
    .replace(/(\+?\d[\d ]{4,})(\d{3})/g, (_m, _a, b) => `… ${b}`)
}
