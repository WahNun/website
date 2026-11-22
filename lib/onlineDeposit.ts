/**
 * Online-Deposit (Lucas 30.10.2026): Gast darf auf /book ab 350 € Warenkorb 50 % anzahlen.
 *   - 50 % auf alle Positionen (Produkt, Refresher, Equipment/Add-ons, Custom) — AUSSER Versicherung.
 *     DAN-Versicherung wird immer voll bezahlt und bleibt als volles Line-Item auf Stripe und KeyInvoice-Rechnung.
 *   - Threshold gilt auf die GESAMTSUMME des Warenkorbs (inkl. Versicherung).
 *   - Schalter site_settings.online_deposit_mode: 'off' | 'sandbox' | 'live' (Admin → Front Office, neben Booking mode).
 *     'sandbox' = nur Sandbox-Requests (/book?sandbox=1 mit Staff-Token) sehen die Option.
 * Der Server entscheidet verbindlich (Threshold + Modus); das Frontend zeigt nur an.
 */
export const ONLINE_DEPOSIT_THRESHOLD_CENTS = 35000
export const ONLINE_DEPOSIT_FRACTION = 0.5

export type OnlineDepositMode = 'off' | 'sandbox' | 'live'
export const ONLINE_DEPOSIT_MODES: OnlineDepositMode[] = ['off', 'sandbox', 'live']

export function asOnlineDepositMode(v: unknown): OnlineDepositMode {
  return v === 'live' || v === 'sandbox' ? v : 'off'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOnlineDepositMode(supabase: any): Promise<OnlineDepositMode> {
  const { data, error } = await supabase.from('site_settings').select('value').eq('key', 'online_deposit_mode').maybeSingle()
  if (error) console.warn('[onlineDeposit] read failed, falling back to off:', error.message)
  return asOnlineDepositMode(data?.value)
}

/** Darf dieser Request die Deposit-Option nutzen? (Modus + Sandbox-Flag + Warenkorbsumme) */
export function onlineDepositAllowed(o: { mode: OnlineDepositMode; isSandbox: boolean; totalCents: number }): { ok: true } | { ok: false; reason: string } {
  if (o.totalCents < ONLINE_DEPOSIT_THRESHOLD_CENTS) return { ok: false, reason: `A 50% deposit is only available for bookings of €${(ONLINE_DEPOSIT_THRESHOLD_CENTS / 100).toFixed(0)} or more.` }
  if (o.mode === 'live') return { ok: true }
  if (o.mode === 'sandbox' && o.isSandbox) return { ok: true }
  return { ok: false, reason: 'Deposit payment is not available for this booking.' }
}

/** Anteil einer Einzelposition bei Deposit (Ceil-Rundung je Position, identisch in Frontend und Server). */
export function depositUnitCents(unitCents: number): number {
  return Math.ceil(unitCents * ONLINE_DEPOSIT_FRACTION)
}

/**
 * Stripe-Line-Items auf 50 % umrechnen — Versicherung bleibt voll (Lucas 30.10.). Wird für die Freigabe von
 * Buchungsanfragen gebraucht (gleiche Regel wie der Sofort-Checkout). Gibt null zurück, wenn eine Position nicht
 * halbierbar ist (fester Stripe-Preis statt price_data) — dann greift der Aufrufer auf seinen Fallback zurück.
 */
export function depositLineItems(items: Array<Record<string, unknown>>): { items: Array<Record<string, unknown>>; amountCents: number } | null {
  if (!items.length) return null
  const out: Array<Record<string, unknown>> = []
  let sum = 0
  for (const it of items) {
    const pd = it.price_data as { currency?: string; unit_amount?: unknown; product_data?: Record<string, unknown> } | undefined
    if (!pd || typeof pd.unit_amount !== 'number') return null
    const qty = Math.max(1, Math.floor(Number(it.quantity ?? 1)) || 1)
    const name = String(pd.product_data?.name ?? '')
    const isInsurance = /insurance/i.test(name)
    const unit = isInsurance ? pd.unit_amount : depositUnitCents(pd.unit_amount)
    out.push({ ...it, quantity: qty, price_data: { ...pd, unit_amount: unit, product_data: { ...(pd.product_data ?? {}), name: isInsurance || /50% deposit/.test(name) ? name : `${name} — 50% deposit` } } })
    sum += unit * qty
  }
  return { items: out, amountCents: sum }
}

/** Anzeige-Näherung ohne Positionen: 50 % auf (Summe − Versicherung) + Versicherung voll. */
export function depositApproxCents(totalCents: number, insuranceCents: number): number {
  const ins = Math.max(0, Math.min(totalCents, insuranceCents))
  return depositUnitCents(totalCents - ins) + ins
}
