import { recomputePaymentState } from '@/lib/paymentState'
import { payoutError, payoutNeeded, maskPayout } from '@/lib/refundReasons'
import { encryptPayout } from '@/lib/payoutCrypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>

export const REFUND_METHODS = ['stripe', 'cash', 'bank', 'revolut', 'mb_way', 'other'] as const
export type RefundMethod = (typeof REFUND_METHODS)[number]

export function normalizeRefundMethod(m: string | null | undefined, fallbackStripe: boolean): RefundMethod {
  const x = (m ?? '').toLowerCase().replace('bank_transfer', 'bank').replace('card', 'stripe')
  if ((REFUND_METHODS as readonly string[]).includes(x)) return x as RefundMethod
  return fallbackStripe ? 'stripe' : 'cash'
}

/** Netto gezahlt (booking_payments paid) und bereits beantragt/erstattet (booking_refunds requested+paid). */
export async function refundLedger(db: Db, bookingId: string) {
  const [{ data: pays }, { data: refs }] = await Promise.all([
    db.from('booking_payments').select('amount').eq('booking_id', bookingId).eq('status', 'paid'),
    db.from('booking_refunds').select('amount, status').eq('booking_id', bookingId).in('status', ['requested', 'paid']),
  ])
  const paidCents = (pays ?? []).reduce((a: number, r: { amount: number | null }) => a + (r.amount ?? 0), 0)
  const requestedCents = (refs ?? []).filter((r: { status: string }) => r.status === 'requested').reduce((a: number, r: { amount: number }) => a + r.amount, 0)
  const refundedPaidCents = (refs ?? []).filter((r: { status: string }) => r.status === 'paid').reduce((a: number, r: { amount: number }) => a + r.amount, 0)
  return { paidCents, requestedCents, refundedPaidCents, committedCents: requestedCents + refundedPaidCents, availableCents: Math.max(0, paidCents - requestedCents - refundedPaidCents) }
}

/**
 * Legt einen Refund-Antrag an und zieht bookings.status / refunded_amount_cents nach.
 * Summe aller Anträge darf das netto Gezahlte nicht übersteigen. Vollrefund (Summe ≥ Buchungssumme) storniert die Sessions.
 */
export async function requestRefund(db: Db, p: {
  bookingId: string
  amountCents: number
  method: RefundMethod
  description: string
  requestedBy?: { id: string; email?: string | null }
  cancelSessionsIfFull?: boolean
  /** @deprecated bookings.status wird von Refunds nie mehr angefasst */
  setBookingStatus?: boolean
  /** booking_payments.id oder Positions-Keys, die dieser Antrag abdeckt */
  sourceRefs?: string[]
  /** booking_sessions.id, die mit diesem Antrag storniert werden (Audit O-8) */
  releaseSessionIds?: string[]
  /** Zielkonto bei Bank / MB Way / Revolut / Other — Pflicht, sonst weiß Finances nicht, wohin */
  payoutDetails?: string | null
}): Promise<{ ok: true; refundId: string; status: string; committedCents: number } | { ok: false; error: string; status?: number }> {
  const { data: b } = await db.from('bookings').select('id, status, amount, is_test, currency').eq('id', p.bookingId).maybeSingle()
  if (!b) return { ok: false, error: 'Booking not found', status: 404 }
  // Review #4: auch stornierte Buchungen können noch Geld halten — Ledger-Cap (availableCents) schützt vor Über-Refund.
  if (!Number.isInteger(p.amountCents) || p.amountCents <= 0) return { ok: false, error: 'amount_cents must be a positive integer', status: 400 }
  if (!p.description?.trim()) return { ok: false, error: 'description is required — say what this refund is for', status: 400 }

  const pErr = payoutError(p.method, p.payoutDetails)
  if (pErr) return { ok: false, error: pErr, status: 400 }

  const led = await refundLedger(db, p.bookingId)
  if (p.amountCents > led.availableCents) {
    return { ok: false, error: `Refund exceeds what the guest has paid: paid ${(led.paidCents / 100).toFixed(2)}, already requested/refunded ${(led.committedCents / 100).toFixed(2)}, available ${(led.availableCents / 100).toFixed(2)}`, status: 400 }
  }

  // Zielkonto nur verschlüsselt ablegen; für die Anzeige zusätzlich eine maskierte Fassung. Ohne Schlüssel: Abbruch statt Klartext.
  let payoutEnc: string | null = null
  let payoutMasked: string | null = null
  if (payoutNeeded(p.method)) {
    const plain = (p.payoutDetails ?? '').trim()
    try { payoutEnc = encryptPayout(plain); payoutMasked = maskPayout(plain) }
    catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Payout encryption failed', status: 500 } }
  }

  const { data: row, error: insErr } = await db.from('booking_refunds').insert({
    booking_id: p.bookingId,
    amount: p.amountCents,
    currency: b.currency ?? 'eur',
    method: p.method,
    status: 'requested',
    description: p.description.trim(),
    payout_details: payoutEnc,
    payout_masked: payoutMasked,
    requested_by: p.requestedBy?.id ?? null,
    requested_by_email: p.requestedBy?.email ?? null,
    is_test: b.is_test ?? false,
    source_refs: (p.sourceRefs ?? []).filter(x => typeof x === 'string' && x.length <= 80).slice(0, 50),
  }).select('id').single()
  if (insErr || !row) return { ok: false, error: insErr?.message ?? 'insert failed', status: 500 }

  const committed = led.committedCents + p.amountCents
  const isFull = (b.amount ?? 0) > 0 && committed >= (b.amount ?? 0)
  const now = new Date().toISOString()
  // Lebenszyklus (status) bleibt unberührt — ein Refund sagt nichts darüber, ob der Gast kommt. Stornieren macht /api/cancel.
  await db.from('bookings').update({
    refunded_amount_cents: committed,
    refunded_at: now,
    refund_paid_at: null,
    refund_notes: `Refund via: ${p.method} — ${p.description.trim()}`,
    updated_at: now,
  }).eq('id', p.bookingId)
  const paymentState = await recomputePaymentState(db, p.bookingId)
  // Versicherung zurückerstattet → Taucher sind nicht mehr über uns versichert: raus aus dem DAN-Export, Nachweis-Flag zurück.
  // Sonst würde DAN eine Police kaufen, die dem Gast nicht mehr berechnet ist (Lucas 24.10.).
  if ((p.sourceRefs ?? []).includes('insurance')) {
    const { data: divers } = await db.from('booking_customers').update({ insurance_source: 'own', insurance_flag: true, insurance_verified_at: null, insurance_verified_by: null })
      .eq('booking_id', p.bookingId).eq('insurance_source', 'azd_day').select('id')
    const n = divers?.length ?? 0
    if (n) await db.from('booking_changelog').insert({
      booking_id: p.bookingId, action: 'insurance_removed', changed_by_email: p.requestedBy?.email ?? null,
      description: `🛡 DAN insurance refunded — ${n} diver(s) no longer covered by us: removed from DAN export, insurance proof required again at the centre`,
    })
  }
  if (isFull && p.cancelSessionsIfFull === true) {
    await db.from('booking_sessions').update({ status: 'cancelled' }).eq('booking_id', p.bookingId).eq('status', 'booked')
  }
  let released = 0
  if (p.releaseSessionIds?.length) { // Review #3: angekreuzte Tage auch freigeben, wenn der Betrag die Buchungssumme erreicht
    const { data: rel } = await db.from('booking_sessions').update({ status: 'cancelled' })
      .eq('booking_id', p.bookingId).eq('status', 'booked').in('id', p.releaseSessionIds).select('id, session_date, session')
    released = rel?.length ?? 0
    if (released) await db.from('booking_changelog').insert({
      booking_id: p.bookingId, action: 'sessions_released', changed_by_email: p.requestedBy?.email ?? null,
      description: `🪑 ${released} session(s) released with refund request: ${(rel ?? []).map((x: { session_date: string; session: string }) => `${x.session_date} ${String(x.session).toUpperCase()}`).join(', ')}`,
    })
  }
  await db.from('booking_changelog').insert({
    booking_id: p.bookingId, action: 'refund_requested', changed_by_email: p.requestedBy?.email ?? null,
    description: `↩️ Refund requested: ${(p.amountCents / 100).toFixed(2)} EUR via ${p.method} — "${p.description.trim()}" — ${p.method === 'cash' ? 'waiting in Front Office → Cash refunds (or Finances → Action needed)' : 'awaiting authorization in Finances → Refunds'} (${(committed / 100).toFixed(2)} of ${((b.amount ?? 0) / 100).toFixed(2)} committed)`,
  })
  return { ok: true, refundId: row.id, status: paymentState ?? (isFull ? 'fully_refunded' : 'partially_refunded'), committedCents: committed }
}
