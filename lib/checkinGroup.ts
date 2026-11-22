import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>

export interface GroupGuest {
  label: string
  token: string
  product_name: string | null
  booking_date: string | null
  session: string | null
  /** Zusatzprodukte dieser Buchung (Skills Update, Equipment, Versicherung …) — damit Gäste nicht verwechselt werden */
  extras: string[]
  done: boolean
  self: boolean
}

/**
 * Buchungen derselben Zahlung (Split-Buchung: Eltern + Kinder, je eigener Token/Check-in).
 * Wer einen Buchungs-Token hat, bekommt die Links der anderen Gäste — dieselbe Information steht in der Bestätigungsmail.
 * includeSelf=false lässt die Buchung selbst weg. Stornierte Buchungen fehlen.
 */
type GroupRow = { id: string; checkin_token: string; product_name: string | null; booking_date: string | null; session: string | null; status: string | null; parent_booking_id: string | null; stripe_session_id: string | null; created_at: string; checkin_completed_at: string | null; booking_extras: unknown }

/** Buchungen derselben Zahlung in Anlegereihenfolge + Personennummer je Position (gleiche Person = mehrere Karten). */
async function loadGroup(supabase: Db, bookingId: string): Promise<{ rootId: string; ordered: GroupRow[]; personNo: (k: number) => number } | null> {
  const { data: me } = await supabase.from('bookings').select('id, parent_booking_id').eq('id', bookingId).maybeSingle()
  if (!me) return null
  const rootId = me.parent_booking_id ?? me.id
  const { data: rows } = await supabase.from('bookings')
    .select('id, checkin_token, product_name, booking_date, session, status, parent_booking_id, stripe_session_id, created_at, checkin_completed_at, booking_extras')
    .or(`id.eq.${rootId},parent_booking_id.eq.${rootId}`)
  if (!rows || rows.length < 2) return null
  // Eltern-Buchung zuerst, dann Kinder in Anlegereihenfolge (= Reihenfolge der Positionen im Checkout)
  const ordered = ([...rows] as GroupRow[]).sort((a, b) => (a.id === rootId ? -1 : b.id === rootId ? 1 : String(a.created_at).localeCompare(String(b.created_at))))
  type Spec = { guests?: { person_no?: string }[] }
  let spec = null as Spec | null
  const rootRow = ordered.find(r => r.id === rootId)
  if (rootRow?.stripe_session_id) {
    const { data: cs } = await supabase.from('checkout_specs').select('spec').eq('stripe_session_id', rootRow.stripe_session_id).maybeSingle()
    spec = (cs?.spec as Spec | null) ?? null
  }
  const personNo = (k: number) => parseInt(spec?.guests?.[k]?.person_no ?? String(k + 1), 10) || k + 1
  return { rootId, ordered, personNo }
}

/** Andere Karten (Buchungen) derselben Person — ihr Check-in gilt mit. Leer ohne Split/Zusatzprodukte. */
export async function siblingCardIds(supabase: Db, bookingId: string): Promise<string[]> {
  const g = await loadGroup(supabase, bookingId)
  if (!g) return []
  const k = g.ordered.findIndex(r => r.id === bookingId)
  if (k < 0) return []
  const year = (r: GroupRow) => String(r.booking_date ?? '').slice(0, 4)
  // Nur Karten desselben Kalenderjahres — ein Check-in deckt nie Tauchtage in einem anderen Jahr ab
  return g.ordered.filter((r, j) => j !== k && g.personNo(j) === g.personNo(k) && r.status !== 'cancelled' && r.status !== 'no_show' && year(r) === year(g.ordered[k])).map(r => r.id)
}

/**
 * Pro PERSON ein Eintrag (ein Check-in-Link): die Karte mit dem frühesten Tauchtag trägt den Link,
 * weitere Karten derselben Person erscheinen als „Also: …" in den Extras.
 * includeSelf=false lässt die Person der anfragenden Buchung weg. Stornierte Buchungen fehlen.
 */
export async function groupGuests(supabase: Db, bookingId: string, includeSelf: boolean): Promise<GroupGuest[]> {
  const g = await loadGroup(supabase, bookingId)
  if (!g) return []
  const { ordered, personNo } = g
  const { data: bcs } = await supabase.from('booking_customers').select('booking_id, checkin_completed_at').in('booking_id', ordered.map(r => r.id))
  const doneOf = (id: string, fallback: string | null) => {
    const mine = ((bcs ?? []) as { booking_id: string; checkin_completed_at: string | null }[]).filter(x => x.booking_id === id)
    return mine.length > 0 ? mine.every(x => x.checkin_completed_at) : Boolean(fallback)
  }
  const active = ordered.map((r, k) => ({ r, k })).filter(({ r }) => r.status !== 'cancelled' && r.status !== 'no_show' && r.checkin_token)
  const persons = [...new Set(active.map(x => personNo(x.k)))]
  const out: GroupGuest[] = []
  for (const pn of persons) {
    const cards = active.filter(x => personNo(x.k) === pn)
    const primary = [...cards].sort((a, b) => String(a.r.booking_date ?? '9999').localeCompare(String(b.r.booking_date ?? '9999')) || a.k - b.k)[0]
    const self = cards.some(x => x.r.id === bookingId)
    if (self && !includeSelf) continue
    const ex = (primary.r.booking_extras ?? {}) as { addons?: { name?: string }[]; equipment?: { name?: string }[]; insurance?: { name?: string } }
    const extras = [
      ...(ex.addons ?? []).map(x => x.name),
      ...(ex.equipment ?? []).map(x => x.name),
      ex.insurance?.name,
      ...cards.filter(x => x !== primary).map(x => x.r.product_name ? `Also: ${x.r.product_name}${x.r.booking_date ? ` (${x.r.booking_date})` : ''}` : undefined),
    ].filter((x): x is string => Boolean(x))
    out.push({
      label: `Guest ${pn}`,
      token: primary.r.checkin_token, product_name: primary.r.product_name, booking_date: primary.r.booking_date ? String(primary.r.booking_date) : null,
      session: primary.r.session ?? null, extras, done: cards.every(x => doneOf(x.r.id, x.r.checkin_completed_at)), self,
    })
  }
  return out
}
