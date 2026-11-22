import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Zahlungsstatus einer Buchung — getrennt vom Lebenszyklus (bookings.status).
 *   status:        pending → confirmed → completed | no_show | cancelled   (ob die Buchung stattfindet)
 *   payment_state: unpaid | deposit | paid | overpaid | refund_pending | partially_refunded | fully_refunded   (wie es ums Geld steht)
 *   refund_pending = mindestens ein Refund beantragt, aber noch nicht in Finances freigegeben (es ist noch kein Geld geflossen).
 * Ein Teilrefund (z. B. nur die Versicherung) ändert den Lebenszyklus nicht — der Gast kommt trotzdem.
 * Wird aus dem Ledger berechnet (booking_payments paid, booking_refunds requested+paid), nie manuell gesetzt.
 */
export type PaymentState = 'unpaid' | 'deposit' | 'paid' | 'overpaid' | 'refund_pending' | 'partially_refunded' | 'fully_refunded'
export const PAYMENT_STATES: PaymentState[] = ['unpaid', 'deposit', 'paid', 'overpaid', 'refund_pending', 'partially_refunded', 'fully_refunded']

export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  unpaid: 'Unpaid', deposit: 'Deposit paid', paid: 'Paid', overpaid: 'Overpaid',
  refund_pending: 'Refund pending', partially_refunded: 'Partially refunded', fully_refunded: 'Fully refunded',
}
export const PAYMENT_STATE_COLOR: Record<PaymentState, string> = {
  unpaid: '#ff6464', deposit: '#ffd080', paid: '#4ade80', overpaid: '#a78bfa',
  refund_pending: '#6ec1ff', partially_refunded: '#ffa030', fully_refunded: '#8a8f99',
}

export function derivePaymentState(d: { amountCents: number; paidCents: number; refundCommittedCents: number; refundOpenCents?: number }): PaymentState {
  const amount = Math.max(0, d.amountCents)
  const paid = Math.max(0, d.paidCents)
  const refunded = Math.max(0, d.refundCommittedCents)
  // Offener Antrag (noch nicht freigegeben) → erst „Refund pending“; „(Partially|Fully) refunded“ erst, wenn alles autorisiert ist.
  if (Math.max(0, d.refundOpenCents ?? 0) > 0) return 'refund_pending'
  if (refunded > 0) {
    // Vollrefund = alles Gezahlte geht zurück (oder die ganze Buchungssumme). paid > 0 nötig, sonst wäre jeder
    // Refund auf eine Buchung ohne Ledger-Zeilen „fully refunded“ (Review #2).
    if ((paid > 0 && refunded >= paid) || (amount > 0 && refunded >= amount)) return 'fully_refunded'
    return 'partially_refunded'
  }
  if (paid <= 0) return 'unpaid'
  if (amount <= 0) return 'paid' // keine Buchungssumme hinterlegt, aber Geld da
  if (paid > amount) return 'overpaid'
  if (paid >= amount) return 'paid'
  return 'deposit' // Teilzahlung (auch unter 50 % — Buchung bleibt dann pending, Geld ist aber da)
}

type Db = SupabaseClient
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Db | any

/** Ledger lesen, Zustand berechnen, bookings.payment_state schreiben (nur bei Änderung + Changelog). */
export async function recomputePaymentState(db: AnyDb, bookingId: string): Promise<PaymentState | null> {
  const [{ data: b }, { data: pays }, { data: refs }] = await Promise.all([
    db.from('bookings').select('id, amount, paid_at, stripe_session_id, stripe_payment_intent, payment_state').eq('id', bookingId).maybeSingle(),
    db.from('booking_payments').select('amount, status, stripe_payment_intent_id').eq('booking_id', bookingId),
    db.from('booking_refunds').select('amount, status').eq('booking_id', bookingId).in('status', ['requested', 'paid']),
  ])
  if (!b) return null
  let paidCents = (pays ?? []).filter((r: { status: string }) => r.status === 'paid').reduce((a: number, r: { amount: number | null }) => a + (r.amount ?? 0), 0)
  // Alt-Buchungen (Online-Stripe vor dem Ledger): paid_at ohne Stripe-Zeile zählt als Vollzahlung.
  // Stripe-Zeilen jeden Status (auch pending Payment-Request) — gleiche Regel wie SQL-Backfill und FO-Summary (Review #8).
  const hasStripeRows = (pays ?? []).some((r: { stripe_payment_intent_id: string | null }) => Boolean(r.stripe_payment_intent_id))
  if ((b.stripe_session_id || b.stripe_payment_intent) && !hasStripeRows && b.paid_at && (b.amount ?? 0) > 0) paidCents += b.amount
  const refundCommittedCents = (refs ?? []).reduce((a: number, r: { amount: number }) => a + r.amount, 0)
  const refundOpenCents = (refs ?? []).filter((r: { status: string }) => r.status === 'requested').reduce((a: number, r: { amount: number }) => a + r.amount, 0)
  const next = derivePaymentState({ amountCents: b.amount ?? 0, paidCents, refundCommittedCents, refundOpenCents })
  if (next !== b.payment_state) {
    await db.from('bookings').update({ payment_state: next, updated_at: new Date().toISOString() }).eq('id', bookingId)
    await db.from('booking_changelog').insert({
      booking_id: bookingId, action: 'payment_state', field: 'payment_state', old_value: b.payment_state ?? null, new_value: next,
      // Refund nur erwaehnen, wenn es tatsaechlich einen gibt (sonst verwirrt „refunded 0.00“).
      description: refundCommittedCents > 0
        ? `💶 Payment state: ${PAYMENT_STATE_LABEL[next]} (paid ${(paidCents / 100).toFixed(2)}, ${refundOpenCents > 0 ? `refund requested ${(refundOpenCents / 100).toFixed(2)} — awaiting authorization${refundCommittedCents > refundOpenCents ? `, already refunded ${((refundCommittedCents - refundOpenCents) / 100).toFixed(2)}` : ''}` : `refunded ${(refundCommittedCents / 100).toFixed(2)}`}, booking total ${((b.amount ?? 0) / 100).toFixed(2)})`
        : `💶 Payment state: ${PAYMENT_STATE_LABEL[next]} (paid ${(paidCents / 100).toFixed(2)} of ${((b.amount ?? 0) / 100).toFixed(2)})`,
    })
  }
  return next
}
