import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff } from '@/lib/staffAuth'
import { reportError } from '@/lib/errors'
import { auditStaff } from '@/lib/auditServer'
import { sendBookingRequestDeclined } from '@/lib/email'
import { loadRequestBooking, requestCapacityCheck, resolveRequestTickets } from '@/lib/requestCheckout'

export const runtime = 'nodejs'

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

/**
 * POST /api/booking-request/decline  { booking_id, reason }  (Staff)
 * Anfrage ablehnen: Buchung (+ Kinder) → cancelled, request_state → declined, Mail mit Begründung/Alternativen.
 * Keine Zahlung vorhanden → kein Refund-Pfad nötig (/api/cancel bleibt für bezahlte Buchungen).
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(req)
  if (auth instanceof NextResponse) return auth
  let body: { booking_id?: string; reason?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const reason = (body.reason ?? '').trim()
  if (!body.booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })
  if (reason.length < 5) return NextResponse.json({ error: 'Please write a short reason / alternatives for the guest (min. 5 characters)' }, { status: 400 })

  const supabase = getServiceClient()
  const found = await loadRequestBooking(supabase, { id: body.booking_id })
  if (!found) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  const { parent, kids } = found
  if (parent.parent_booking_id) return NextResponse.json({ error: 'This is a linked guest booking — decline the main booking instead' }, { status: 400 })
  if (!['requested', 'approved', 'expired'].includes(parent.request_state ?? '')) {
    return NextResponse.json({ error: `Request is ${parent.request_state ?? 'not a request'} — cannot decline` }, { status: 409 })
  }
  if (parent.status !== 'pending') return NextResponse.json({ error: `Booking status is ${parent.status} — use Cancel booking for paid bookings` }, { status: 409 })
  // Sicherheitsnetz: liegt schon eine Zahlung vor (Gast hat den Link gerade benutzt), nicht blind stornieren.
  const { data: paid } = await supabase.from('booking_payments').select('id').in('booking_id', [parent.id, ...kids.map(k => k.id)]).eq('status', 'paid').limit(1)
  if (paid && paid.length > 0) return NextResponse.json({ error: 'A payment is already recorded for this request — use Cancel booking (refund flow) instead' }, { status: 409 })

  try {
    const now = new Date().toISOString()
    const actor = auth.user.email ?? auth.user.id
    const ids = [parent.id, ...kids.map(k => k.id)]
    const { error: updErr } = await supabase.from('bookings')
      .update({ status: 'cancelled', request_state: 'declined', declined_reason: reason, cancelled_at: now, updated_at: now })
      .in('id', ids)
    if (updErr) throw new Error(updErr.message)
    // Offene Platzhalter-Zahlungen (Stripe-Link) schließen
    await supabase.from('booking_payments').update({ status: 'cancelled', notes: `Request declined by ${actor}` }).in('booking_id', ids).eq('status', 'pending')
    await resolveRequestTickets(supabase, parent.id)
    for (const id of ids) {
      await supabase.from('booking_changelog').insert({ booking_id: id, action: 'status_change', field: 'status', old_value: 'pending', new_value: 'cancelled', description: `❌ Request declined by ${actor}: ${reason.slice(0, 300)}`, changed_by_email: actor })
    }
    let mailError: string | undefined
    if (parent.customer_email) {
      try {
        const { sessions } = await requestCapacityCheck(supabase, parent, kids)
        const seen = new Set<string>()
        const uniq = sessions.filter(x => { const k = `${x.date}_${x.session}`; if (seen.has(k)) return false; seen.add(k); return true })
        const r = await sendBookingRequestDeclined({
          to: parent.customer_email, guestName: parent.customer_name ?? null,
          productName: kids.length ? `${parent.product_name ?? 'Booking'} + ${kids.length} more guest${kids.length === 1 ? '' : 's'}` : (parent.product_name ?? 'Booking'),
          sessions: uniq, groupSize: [parent, ...kids].reduce((a, p) => a + Math.max(1, p.group_size), 0),
          totalCents: [parent, ...kids].reduce((a, p) => a + (p.amount ?? 0), 0), isTest: parent.is_test, bookingId: parent.id, reason,
        })
        if (!r.ok) throw new Error(r.error ?? 'send failed')
        await supabase.from('booking_changelog').insert({ booking_id: parent.id, action: 'email_sent', description: `📧 Request declined email sent to ${parent.customer_email}` })
      } catch (e) {
        mailError = e instanceof Error ? e.message : String(e)
        await supabase.from('booking_changelog').insert({ booking_id: parent.id, action: 'email_failed', description: `⚠️ Request declined email failed: ${mailError}` })
      }
    }
    await auditStaff(supabase, auth.user, 'request_declined', 'booking', parent.id, `Booking request declined: ${reason.slice(0, 200)}`, { reason, kids: kids.map(k => k.id) })
    return NextResponse.json({ ok: true, ...(mailError ? { mail_error: mailError } : {}) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const ref = await reportError('pay', e, { route: '/api/booking-request/decline', booking_id: parent.id })
    return NextResponse.json({ error: `Decline failed: ${msg}`, ref }, { status: 500 })
  }
}
