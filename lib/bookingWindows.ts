/**
 * Buchungsfenster (Lucas 28.10.2026) — reine Auflösung, läuft im Browser (/book) und auf dem Server (/api/checkout).
 *
 * Regel: spezifischste Regel gewinnt — Produkt+Schicht > Produkt > Schicht > nur Zeitraum.
 * Gleichstand: blocked > request > open. Keine Regel → Default (site_settings.booking_mode).
 */
export type WindowMode = 'open' | 'request' | 'blocked'

export type WindowRule = {
  id?: string
  from_date: string
  to_date: string
  mode: WindowMode
  session: 'am' | 'pm' | 'night' | null
  product_id: string | null
  guest_text: string | null
}

export type ResolvedMode = { mode: WindowMode; guest_text: string | null; rule: WindowRule | null }

const RANK: Record<WindowMode, number> = { blocked: 3, request: 2, open: 1 }

function specificity(r: WindowRule): number {
  return (r.product_id ? 2 : 0) + (r.session ? 1 : 0)
}

export function resolveWindowMode(
  rules: WindowRule[],
  fallback: WindowMode,
  q: { date: string; session: string | null; product_id: string | null },
): ResolvedMode {
  let best: WindowRule | null = null
  let bestSpec = -1
  for (const r of rules) {
    if (q.date < r.from_date || q.date > r.to_date) continue
    if (r.session && (!q.session || q.session === 'tbd' || r.session !== q.session)) continue
    if (r.product_id && r.product_id !== q.product_id) continue
    const sp = specificity(r)
    if (sp > bestSpec || (sp === bestSpec && best && RANK[r.mode] > RANK[best.mode])) { best = r; bestSpec = sp }
  }
  return best ? { mode: best.mode, guest_text: best.guest_text, rule: best } : { mode: fallback, guest_text: null, rule: null }
}

/** Mehrere Slots einer Buchung: blocked schlägt request schlägt open. */
export function resolveBookingMode(
  rules: WindowRule[],
  fallback: WindowMode,
  slots: { date: string; session: string | null; product_id: string | null }[],
): { mode: WindowMode; blocked: { date: string; session: string | null; guest_text: string | null }[]; requestSlots: number } {
  const blocked: { date: string; session: string | null; guest_text: string | null }[] = []
  let requestSlots = 0
  for (const sl of slots) {
    const r = resolveWindowMode(rules, fallback, sl)
    if (r.mode === 'blocked') blocked.push({ date: sl.date, session: sl.session, guest_text: r.guest_text })
    else if (r.mode === 'request') requestSlots++
  }
  return { mode: blocked.length ? 'blocked' : requestSlots > 0 ? 'request' : 'open', blocked, requestSlots }
}

export const WINDOW_MODE_LABEL: Record<WindowMode, string> = { open: 'Open — instant payment', request: 'On request — team approves, then payment link', blocked: 'Blocked — not bookable online' }
