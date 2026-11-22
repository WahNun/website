import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff } from '@/lib/staffAuth'
import { sendPostDive } from '@/lib/email'
import { auditStaff } from '@/lib/auditServer'

/**
 * POST /api/attendance — Staff entscheidet, ob ein nicht eingecheckter Gast da war.
 *   { booking_id, outcome: 'present' | 'no_show' | 'trip_cancelled', dive_date?: 'YYYY-MM-DD', ticket_id? }
 *   present → Sessions bis einschließlich dive_date 'completed', Buchung 'completed' (wenn kein künftiger Tag offen),
 *             customers.last_dive_date nachziehen, Danke-Mail (idempotent über post_dive_mails).
 *   no_show → Buchung 'no_show', offene Sessions bis einschließlich dive_date 'cancelled' (Plätze frei). Kein Refund (AGB).
 *   trip_cancelled → AZD hat den Tag abgesagt (Wetter/kein Boot): Sessions des Tages 'cancelled' mit Vermerk, Buchung bleibt wie sie ist
 *                     (kein No-show, keine Danke-Mail); Umbuchung/Refund läuft normal über das Front Office.
 * Geld bleibt unberührt — payment_state ist davon unabhängig. Ticket (falls angegeben) wird resolved.
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(req)
  if (auth instanceof NextResponse) return auth
  const { user } = auth

  let body: { booking_id?: string; outcome?: string; dive_date?: string; ticket_id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }
  const bookingId = body.booking_id ?? ''
  const outcome = body.outcome
  if (!bookingId || (outcome !== 'present' && outcome !== 'no_show' && outcome !== 'trip_cancelled')) {
    return NextResponse.json({ ok: false, error: 'booking_id and outcome (present | no_show | trip_cancelled) required' }, { status: 400 })
  }
  const diveDate = /^\d{4}-\d{2}-\d{2}$/.test(body.dive_date ?? '') ? body.dive_date! : new Date(new Date().toLocaleString('en-US', { timeZone: 'Atlantic/Azores' })).toISOString().slice(0, 10)

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: b } = await supabase.from('bookings').select('id, status, customer_email, customer_name, is_test').eq('id', bookingId).maybeSingle()
  if (!b) return NextResponse.json({ ok: false, error: 'Booking not found' }, { status: 404 })
  if (b.status === 'cancelled') return NextResponse.json({ ok: false, error: 'Booking is cancelled' }, { status: 409 })

  const now = new Date().toISOString()
  const by = user.email ?? null
  let mail: 'sent' | 'skipped' | 'error' = 'skipped'
  let mailError: string | undefined

  if (outcome === 'trip_cancelled') {
    const { data: rel } = await supabase.from('booking_sessions').update({ status: 'cancelled', notes: 'Cancelled by AZD (weather / no boat)' })
      .eq('booking_id', bookingId).eq('status', 'booked').eq('session_date', diveDate).select('id')
    await supabase.from('booking_changelog').insert({
      booking_id: bookingId, action: 'trip_cancelled', changed_by_email: by,
      description: `⛔ Dive day ${diveDate} cancelled by AZD (recorded by ${by ?? 'staff'}) — ${rel?.length ?? 0} session(s) cancelled, booking unchanged; rebook or refund via Front Office`,
    })
  } else if (outcome === 'no_show') {
    const { data: rel } = await supabase.from('booking_sessions').update({ status: 'cancelled' })
      .eq('booking_id', bookingId).eq('status', 'booked').lte('session_date', diveDate).select('id')
    await supabase.from('bookings').update({ status: 'no_show', updated_at: now }).eq('id', bookingId)
    await supabase.from('booking_changelog').insert({
      booking_id: bookingId, action: 'status_change', field: 'status', old_value: b.status, new_value: 'no_show', changed_by_email: by,
      description: `🚫 Marked as no-show for ${diveDate} by ${by ?? 'staff'} — ${rel?.length ?? 0} session(s) released, no refund (terms)`,
    })
  } else {
    await supabase.from('booking_sessions').update({ status: 'completed' })
      .eq('booking_id', bookingId).eq('status', 'booked').lte('session_date', diveDate)
    const { count: future } = await supabase.from('booking_sessions').select('id', { count: 'exact', head: true })
      .eq('booking_id', bookingId).eq('status', 'booked').gt('session_date', diveDate)
    const newStatus = future ? b.status : 'completed'
    if (newStatus !== b.status) await supabase.from('bookings').update({ status: 'completed', updated_at: now }).eq('id', bookingId)
    const { data: slots } = await supabase.from('booking_customers').select('customer_id').eq('booking_id', bookingId).not('customer_id', 'is', null)
    const customerIds = [...new Set((slots ?? []).map((r: { customer_id: string }) => r.customer_id))]
    if (customerIds.length) {
      await supabase.from('customers').update({ last_dive_date: diveDate, updated_at: now }).in('id', customerIds).or(`last_dive_date.is.null,last_dive_date.lt.${diveDate}`)
    }
    await supabase.from('booking_changelog').insert({
      booking_id: bookingId, action: 'status_change', field: 'status', old_value: b.status, new_value: newStatus, changed_by_email: by,
      description: `✅ Attendance confirmed for ${diveDate} by ${by ?? 'staff'} (no check-in was recorded) — sessions completed${newStatus === 'completed' ? ', booking completed' : ''}`,
    })
    // Danke-Mail nachholen — idempotent über post_dive_mails (unique booking_id + dive_date)
    if (b.customer_email) {
      const { data: ins, error: insErr } = await supabase.from('post_dive_mails')
        .insert({ booking_id: bookingId, dive_date: diveDate, spots: [], wish_granted: false, is_test: b.is_test ?? false }).select('id').single()
      if (!insErr && ins) {
        const r = await sendPostDive({ to: b.customer_email, firstName: b.customer_name?.split(' ')[0] ?? null, spots: [], wishGranted: false, wishSpotName: null, bookingId, isTest: b.is_test ?? false })
        if (r.ok) { mail = 'sent'; await supabase.from('post_dive_mails').update({ mail_sent_at: now }).eq('id', ins.id) }
        else { mail = 'error'; mailError = r.error; await supabase.from('post_dive_mails').update({ error: r.error ?? 'unknown' }).eq('id', ins.id) }
        await supabase.from('booking_changelog').insert({ booking_id: bookingId, action: mail === 'sent' ? 'email_sent' : 'email_failed', description: mail === 'sent' ? `📧 Post-dive thank-you sent to ${b.customer_email}` : `⚠️ Post-dive mail failed: ${mailError}` })
      }
    }
  }

  await auditStaff(supabase, user, 'attendance_recorded', 'booking', bookingId,
    `Attendance: ${outcome === 'present' ? 'was there (completed)' : outcome === 'no_show' ? 'no-show (seats released)' : 'trip cancelled by AZD'} for ${diveDate}${mail !== 'skipped' ? `; post-dive mail ${mail}${mailError ? ` (${mailError})` : ''}` : ''}`,
    { outcome, dive_date: diveDate, mail, mail_error: mailError ?? null })
  if (body.ticket_id) {
    await supabase.from('support_tickets').update({ status: 'resolved' }).eq('id', body.ticket_id)
    await supabase.from('ticket_notes').insert({ ticket_id: body.ticket_id, author_name: by ?? 'staff', content: outcome === 'present' ? '✅ Was there — booking completed' : outcome === 'no_show' ? '🚫 No-show — seats released' : '⛔ Trip cancelled by AZD — day cancelled, booking kept' }).then(() => {})
  }

  return NextResponse.json({ ok: true, outcome, status: outcome === 'no_show' ? 'no_show' : outcome === 'trip_cancelled' ? b.status : 'completed', mail, ...(mailError ? { mail_error: mailError } : {}) })
}
