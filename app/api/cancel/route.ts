import { NextRequest, NextResponse } from 'next/server'
import { reasonError } from '@/lib/refundReasons'
import { requireStaff } from '@/lib/staffAuth'
import { requestRefund, refundLedger, normalizeRefundMethod } from '@/lib/refunds'
import { createClient } from '@supabase/supabase-js'
import { reportError } from '@/lib/errors'
import { getStripe } from '@/lib/stripe'
import { sendCancellationEmail } from '@/lib/email'
import { auditStaff, auditEur } from '@/lib/auditServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/cancel
 *
 * Storniert eine Buchung:
 *   - Setzt status='cancelled'; Refund läuft als Antrag über Finances (payment_state folgt dem Ledger)
 *   - Setzt alle booking_sessions dieser Buchung auf status='cancelled'
 *   - Optional: Stripe-Vollrückerstattung via with_refund=true (MUSS vor status=cancelled passieren)
 *   - Sendet Storno-Email an Kunden (mit oder ohne Refund-Hinweis)
 *
 * TODO: Keyinvoice Annullierung (wenn Fatura-Recibo vorhanden und
 *       Walk-in ohne Stripe, d.h. noch kein Geld geflossen)
 */

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req)
  if (auth instanceof NextResponse) return auth

  let body: { booking_id: string; reason?: string; with_refund?: boolean; notify_customer?: boolean }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { booking_id, reason, with_refund } = body
  const notifyCustomer = body.notify_customer !== false // default: Mail senden
  if (!booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })
  const rErr = reasonError(reason)
  if (rErr) return NextResponse.json({ error: rErr }, { status: 400 })

  const supabase = getServiceClient()

  const { data: booking, error: loadErr } = await supabase
    .from('bookings')
    .select('id, status, stripe_payment_intent, is_test, customer_name, customer_email, product_name, amount, payment_method')
    .eq('id', booking_id)
    .maybeSingle()

  if (loadErr) return NextResponse.json({ error: `Load failed: ${loadErr.message}` }, { status: 500 })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  if (booking.status === 'cancelled') {
    return NextResponse.json({ error: 'Already cancelled' }, { status: 409 })
  }
  // Teil-/Vollrefund ist kein Hindernis mehr: Zahlungsstatus (payment_state) und Lebenszyklus sind getrennt.

  const now = new Date().toISOString()
  let stripeRefundOk = false
  let stripeRefundErr: string | undefined

  try {
    // ── 1. Refund = ANFRAGE (Freigabe-Schleife, 23.10.): kein Stripe-Call hier. Finances → Refunds gibt frei,
    //      erst dann fließt Geld und der Gast bekommt die Refund-Mail (/api/refund-paid).
    const refundRequested = Boolean(with_refund)
    const refundMethod = booking.stripe_payment_intent ? 'stripe' : (booking.payment_method ?? 'cash')
    stripeRefundOk = refundRequested

    // ── 2. Buchungsstatus setzen ────────────────────────────────────────────────
    // Status bleibt 'cancelled' — das Geld läuft über booking_refunds (Antrag → Finances). bookings.refunded_amount_cents setzt requestRefund.
    const newStatus = 'cancelled'
    const { error: bookingErr } = await supabase
      .from('bookings')
      .update({
        status:          newStatus,
        cancelled_at:    now,
        updated_at:      now,
      })
      .eq('id', booking_id)

    if (bookingErr) throw bookingErr

    // ── 3. Alle booking_sessions canceln ───────────────────────────────────────
    await supabase
      .from('booking_sessions')
      .update({ status: 'cancelled' })
      .eq('booking_id', booking_id)
      .eq('status', 'booked')  // nur aktive Sessions — completed/no_show nicht anfassen

    // TODO: Keyinvoice Annullierung für Walk-in-Buchungen ohne Stripe-Payment

    let refundAmountCents = 0
    if (refundRequested) {
      const led = await refundLedger(supabase, booking_id)
      refundAmountCents = led.availableCents
      if (refundAmountCents > 0) {
        const r = await requestRefund(supabase, {
          bookingId: booking_id, amountCents: refundAmountCents, method: normalizeRefundMethod(refundMethod, Boolean(booking.stripe_payment_intent)),
          description: `Cancellation — ${reason}`, requestedBy: auth.user, cancelSessionsIfFull: false, setBookingStatus: false,
        })
        if (!r.ok) stripeRefundErr = r.error
      } else {
        stripeRefundErr = 'Nothing to refund — guest has not paid (or everything is already requested/refunded)'
      }
    }

    if (reason) {
      console.info(`[cancel] booking=${booking_id} status=${newStatus} reason="${reason}" customer="${booking.customer_name}"`)
    }

    // ── 4. Storno-Email senden ──────────────────────────────────────────────────
    const { data: sessRows } = await supabase
      .from('booking_sessions')
      .select('session_date, session')
      .eq('booking_id', booking_id)
      .order('session_date', { ascending: true })
    const sessionsStr = (sessRows ?? []).map(r => `${r.session_date}:${r.session}`).join(',') || null

    // Awaited + Ergebnis zurückgeben: der FO-Dialog verspricht die Mail, also muss das FO sehen, ob sie rausging.
    let emailSent = false
    let emailError: string | null = null
    if (!notifyCustomer) {
      emailError = 'skipped (notify_customer=false)'
    } else if (!booking.customer_email) {
      emailError = 'no customer email on booking'
    } else {
      try {
        await sendCancellationEmail({
          customerName:  booking.customer_name ?? 'Guest',
          customerEmail: booking.customer_email,
          productName:   booking.product_name ?? 'Dive booking',
          sessions:      sessionsStr,
          amountCents:   refundAmountCents, // tatsächlich beantragter Betrag (netto gezahlt)
          isTest:        booking.is_test ?? false,
          refunded:      refundRequested && refundAmountCents > 0,
        })
        emailSent = true
      } catch (err) {
        emailError = err instanceof Error ? err.message : String(err)
        console.error('[cancel] Email error:', emailError)
      }
    }

    await auditStaff(supabase, auth.user, 'booking_cancelled', 'booking', booking_id,
      `Booking cancelled${reason ? ` (${reason})` : ''} — refund ${refundRequested ? `requested ${auditEur(refundAmountCents)} via ${refundMethod}` : 'not requested'}; guest mail ${emailSent ? 'sent' : `not sent (${emailError ?? 'n/a'})`}${stripeRefundErr ? `; refund warning: ${stripeRefundErr}` : ''}`,
      { reason: reason ?? null, refund_requested: refundRequested, refund_amount_cents: refundAmountCents, refund_method: refundMethod, email_sent: emailSent, email_error: emailError, refund_warning: stripeRefundErr ?? null })
    const { data: after } = await supabase.from('bookings').select('payment_state').eq('id', booking.id).maybeSingle()
    return NextResponse.json({
      ok:            true,
      status:        newStatus,
      payment_state: after?.payment_state ?? null,
      refunded:      refundRequested,
      refund_pending_approval: refundRequested,
      email_sent:    emailSent,
      ...(emailError ? { email_error: emailError } : {}),
      ...(stripeRefundErr ? { refund_warning: stripeRefundErr } : {}),
    })
  } catch (err) {
    const ref = await reportError('ops', err, { route: '/api/cancel', booking_id })
    return NextResponse.json({ error: `Cancel failed: ${err instanceof Error ? err.message : String(err)}`, ref }, { status: 500 })
  }
}
