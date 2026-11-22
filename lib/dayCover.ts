import type { SupabaseClient } from '@supabase/supabase-js'
import { computeInsuranceBlocks } from '@/lib/insurance'
import { recomputePaymentState } from '@/lib/paymentState'

/**
 * DAN-Tagesversicherung nachträglich für EINEN Taucher an die Buchung hängen — aus dem Check-in (Checkbox, Zahlung vor Ort)
 * oder vom Staff am Steg (Taucher-Popup, Zahlung sofort). Preis serverseitig über die 1/3/5/7/10-Tage-Staffel der gebuchten Tage.
 * Wirkung: bookings.amount + booking_extras.insurance, booking_payments-Zeile (pending oder paid), Changelog, payment_state.
 * Die Versicherung des Tauchers selbst (booking_customers.insurance_source = 'azd_day') setzt der Aufrufer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient | any

export async function priceDayCover(db: Db, bookingId: string, fallbackDate: string): Promise<{ cents: number; days: number; dates: string[] }> {
  const { data: sess } = await db.from('booking_sessions').select('session_date').eq('booking_id', bookingId).eq('status', 'booked')
  const dates: string[] = Array.from(new Set<string>((sess ?? []).map((x: { session_date: string }) => String(x.session_date))))
  const useDates = dates.length ? dates : [fallbackDate]
  const blocks = computeInsuranceBlocks(useDates)
  const { data: plans } = await db.from('course_prices').select('id, price_cents').eq('category', 'insurance')
  const cents = blocks.reduce((sum, b) => sum + ((plans ?? []).find((p: { id: string }) => p.id === b.planId)?.price_cents ?? 0) * b.units, 0)
  if (cents <= 0) throw new Error(`insurance price missing for ${blocks.map(b => b.planId).join(', ')} (course_prices, category insurance)`)
  return { cents, days: useDates.length, dates: useDates }
}

export async function addDayCoverToBooking(db: Db, p: {
  bookingId: string
  slotIndex: number
  /** 'pending' = Gast zahlt vor Ort (Check-in); sonst Zahlungsart, Geld ist schon da (Steg) */
  payment: 'pending' | { method: string; recordedBy?: string | null }
  by?: string | null
}): Promise<{ cents: number; days: number }> {
  const now = new Date().toISOString()
  const { data: b } = await db.from('bookings').select('id, amount, booking_extras, currency, booking_date').eq('id', p.bookingId).maybeSingle()
  if (!b) throw new Error('Booking not found')
  const { cents, days } = await priceDayCover(db, p.bookingId, String(b.booking_date))

  type Ins = { name: string; total_cents: number; guests: number; per_diver_cents: number }
  type Ex = { insurance?: Ins | null } & Record<string, unknown>
  const ex: Ex = ((b.booking_extras as Ex | null) ?? {}) as Ex
  const prev = ex.insurance && ex.insurance.total_cents > 0 ? ex.insurance : null
  const nextIns: Ins = prev
    ? { ...prev, guests: (prev.guests ?? 0) + 1, total_cents: (prev.total_cents ?? 0) + cents }
    : { name: 'DAN Dive Insurance', per_diver_cents: cents, guests: 1, total_cents: cents }

  const { error: bErr } = await db.from('bookings').update({ amount: (b.amount ?? 0) + cents, booking_extras: { ...ex, insurance: nextIns }, updated_at: now }).eq('id', p.bookingId)
  if (bErr) throw new Error(bErr.message)

  const paid = p.payment !== 'pending'
  const { error: pErr } = await db.from('booking_payments').insert({
    booking_id: p.bookingId, amount: cents, currency: b.currency ?? 'eur',
    status: paid ? 'paid' : 'pending',
    method: paid ? (p.payment as { method: string }).method : 'on_arrival',
    paid_at: paid ? now : null,
    due_at: paid ? null : b.booking_date,
    recorded_by: paid ? ((p.payment as { recordedBy?: string | null }).recordedBy ?? null) : null,
    notes: `DAN day cover for guest ${p.slotIndex + 1} (${days} day${days === 1 ? '' : 's'}) — ${paid ? 'paid at the centre' : 'to be paid at the centre'}`,
  })
  if (pErr) throw new Error(pErr.message)

  await db.from('booking_changelog').insert({
    booking_id: p.bookingId, action: 'insurance_added', changed_by_email: p.by ?? null,
    description: `🛡 DAN day cover added for guest ${p.slotIndex + 1}: €${(cents / 100).toFixed(2)} for ${days} day(s) — ${paid ? `paid ${(p.payment as { method: string }).method}${p.by ? ` (${p.by})` : ''}` : `due at the centre${p.by ? ` (added by ${p.by})` : ' (bought in check-in)'}`}`,
  })
  await recomputePaymentState(db, p.bookingId)
  return { cents, days }
}

/**
 * Versicherung einer Buchung an die aktuellen Tauchtage anpassen (nach „Add session“ / Datumsänderung im Sessions-Tab).
 * Nur wenn die Buchung DAN enthält (booking_extras.insurance.total_cents > 0). Rechnet per_diver über die Staffel neu,
 * zieht bookings.amount nach (Differenz → Due Balance oder Guthaben), loggt. Gibt die Differenz zurück (0 = nichts zu tun).
 */
export async function reconcileInsuranceForDates(db: Db, bookingId: string, by?: string | null): Promise<{ diffCents: number; perDiverCents: number; days: number } | null> {
  const { data: b } = await db.from('bookings').select('id, amount, booking_extras, booking_date').eq('id', bookingId).maybeSingle()
  if (!b) return null
  type Ins = { name: string; total_cents: number; guests: number; per_diver_cents: number }
  type Ex = { insurance?: Ins | null } & Record<string, unknown>
  const ex: Ex = ((b.booking_extras as Ex | null) ?? {}) as Ex
  const ins = ex.insurance && ex.insurance.total_cents > 0 ? ex.insurance : null
  if (!ins) return null
  const { cents: perDiver, days } = await priceDayCover(db, bookingId, String(b.booking_date))
  const guests = Math.max(1, ins.guests ?? 1)
  const newTotal = perDiver * guests
  const diff = newTotal - (ins.total_cents ?? 0)
  if (diff === 0) return { diffCents: 0, perDiverCents: perDiver, days }
  const now = new Date().toISOString()
  await db.from('bookings').update({
    amount: (b.amount ?? 0) + diff,
    booking_extras: { ...ex, insurance: { ...ins, per_diver_cents: perDiver, total_cents: newTotal } },
    updated_at: now,
  }).eq('id', bookingId)
  await db.from('booking_changelog').insert({
    booking_id: bookingId, action: 'insurance_recalculated', changed_by_email: by ?? null,
    description: `🛡 DAN insurance recalculated for ${days} dive day(s): €${((ins.total_cents ?? 0) / 100).toFixed(2)} → €${(newTotal / 100).toFixed(2)} (${guests} guest${guests === 1 ? '' : 's'}, ${diff > 0 ? '+' : ''}€${(diff / 100).toFixed(2)} on the booking)`,
  })
  await recomputePaymentState(db, bookingId)
  return { diffCents: diff, perDiverCents: perDiver, days }
}

/** DAN-Einkaufspreis einer 1-Tages-Police in Cent (Sales-Export 09/2026: 4,13 €). Nur für die Plausibilitätsprüfung im Export. */
export const DAN_1DAY_COST_CENTS = 413
