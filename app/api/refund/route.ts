import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff } from '@/lib/staffAuth'
import { requestRefund, normalizeRefundMethod } from '@/lib/refunds'
import { reasonError } from '@/lib/refundReasons'
import { auditStaff, auditEur } from '@/lib/auditServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/refund  (staff only) — legt einen REFUND-ANTRAG an (booking_refunds, status requested).
 *   body = { booking_id, amount_cents?, refund_method?, description }
 *   amount_cents fehlt ⇒ Vollrefund = alles, was der Gast netto gezahlt hat.
 * Geld fließt und der Gast wird gemailt erst bei Freigabe in Finances → Refunds (/api/refund-paid).
 * Beliebig viele Teilanträge pro Buchung, bis die Summe das netto Gezahlte erreicht.
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(req)
  if (auth instanceof NextResponse) return auth

  let body: { booking_id?: string; reason?: string; amount_cents?: number; refund_method?: string; description?: string; source_refs?: string[]; release_session_ids?: string[]; payout_details?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const { booking_id, amount_cents, refund_method } = body
  if (!booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: booking } = await supabase.from('bookings').select('id, stripe_payment_intent, payment_method, amount').eq('id', booking_id).maybeSingle()
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const isPartial = typeof amount_cents === 'number' && amount_cents > 0
  const method = normalizeRefundMethod(refund_method ?? booking.payment_method, Boolean(booking.stripe_payment_intent))
  // Karten-Buchung: Refund geht auf die Karte zurueck. Eine andere Auszahlungsart entscheidet nur, wer in Finances freigibt (Override mit Begruendung).
  if (booking.stripe_payment_intent && method !== 'stripe') {
    return NextResponse.json({ error: 'This booking was paid by card — refunds go back through Stripe. If another payout method is really needed, the person who authorizes in Finances → Refunds can override it with a reason.' }, { status: 400 })
  }
  if (method === 'stripe' && !booking.stripe_payment_intent) {
    return NextResponse.json({ error: 'Stripe refund not possible — booking has no Stripe payment. Choose cash/bank/revolut/mb_way.' }, { status: 400 })
  }

  let amount = amount_cents ?? 0
  if (!isPartial) {
    // Vollrefund = Rest des netto Gezahlten
    const { refundLedger } = await import('@/lib/refunds')
    const led = await refundLedger(supabase, booking_id)
    amount = led.availableCents
    if (amount <= 0) return NextResponse.json({ error: 'Nothing left to refund — all payments are already requested or refunded' }, { status: 409 })
  }
  const description = (body.description ?? body.reason ?? '').trim()
  const rErr = reasonError(description)
  if (rErr) return NextResponse.json({ error: rErr }, { status: 400 })

  const r = await requestRefund(supabase, { bookingId: booking_id, amountCents: amount, method, description, requestedBy: auth.user, payoutDetails: body.payout_details ?? null, sourceRefs: Array.isArray(body.source_refs) ? body.source_refs : [], releaseSessionIds: Array.isArray(body.release_session_ids) ? body.release_session_ids.filter((x): x is string => typeof x === 'string') : [] })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 })
  const audit_warning = await auditStaff(supabase, auth.user, 'refund_requested', 'booking', booking_id,
    `Refund requested: ${auditEur(amount)} via ${method}${isPartial ? ' (partial)' : ' (full)'}${description ? ` — "${description}"` : ''}`,
    { refund_id: r.refundId, amount_cents: amount, method, partial: isPartial, booking_total_cents: booking.amount ?? null })
  return NextResponse.json({ ok: true, ...(audit_warning ? { audit_warning } : {}), requested: true, refund_id: r.refundId, partial: isPartial, method, amount_cents: amount, status: r.status, committed_cents: r.committedCents })
}
