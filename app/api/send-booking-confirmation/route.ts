import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendBookingConfirmation } from '@/lib/email'
import { reportError } from '@/lib/errors'
import { auditStaff } from '@/lib/auditServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/send-booking-confirmation
 *
 * Staff-only. Verschickt die Buchungsbestätigung mit Check-in-Link für eine
 * bestehende Buchung — dieselbe Mail, die der Stripe-Webhook nach Online-Zahlung
 * sendet (`sendBookingConfirmation`). Nötig für Walk-ins (Cash & Co.), die nie
 * durch den Webhook laufen und deshalb bisher gar keine Mail bekamen.
 *
 * Body: { booking_id: string, to_email?: string }
 *   to_email überschreibt bookings.customer_email (z. B. wenn die Buchung ohne Mail angelegt wurde).
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile || !['admin', 'staff', 'front_office'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { booking_id?: string; to_email?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const bookingId = body.booking_id
  if (!bookingId) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })

  const { data: booking, error: loadErr } = await supabase
    .from('bookings')
    .select('id, product_name, customer_email, customer_name, group_size, amount, is_test, status, checkin_token, booking_extras, favourite_spot')
    .eq('id', bookingId)
    .maybeSingle()
  if (loadErr) return NextResponse.json({ error: `Load failed: ${loadErr.message}` }, { status: 500 })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (booking.status === 'cancelled') {
    return NextResponse.json({ error: `Booking is ${booking.status}` }, { status: 409 })
  }

  const to = (body.to_email ?? booking.customer_email ?? '').trim().toLowerCase()
  if (!to) return NextResponse.json({ error: 'No email address on booking' }, { status: 400 })
  if (!booking.checkin_token) return NextResponse.json({ error: 'Booking has no check-in token' }, { status: 409 })

  const { data: sessRows, error: sessErr } = await supabase
    .from('booking_sessions')
    .select('session_date, session')
    .eq('booking_id', bookingId)
    .neq('status', 'cancelled')
    .order('session_date', { ascending: true })
  if (sessErr) return NextResponse.json({ error: `Sessions load failed: ${sessErr.message}` }, { status: 500 })

  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://azoresdiving.com'
  // bookings.amount ist in Cents gespeichert (Walk-in: Math.round(eur * 100)).
  const amountCents = typeof booking.amount === 'number' ? booking.amount : null
  const ex = (booking.booking_extras ?? null) as { insurance?: { total_cents?: number } } | null
  const hasAzdInsurance = Boolean(ex?.insurance && (ex.insurance.total_cents ?? 0) > 0)

  try {
    await sendBookingConfirmation({
      to,
      customerName: booking.customer_name ?? null,
      productName: booking.product_name ?? 'Your dive',
      sessions: (sessRows ?? []).map(r => ({ date: r.session_date, session: r.session })),
      checkinUrl: `${origin}/checkin?token=${booking.checkin_token}`,
      groupSize: booking.group_size ?? 1,
      amountCents,
      hasOwnInsurance: !hasAzdInsurance,
      isTest: booking.is_test ?? false,
      bookingId: booking.id,
    })
  } catch (err) {
    const ref = await reportError('ops', err, { route: '/api/send-booking-confirmation', booking_id: bookingId })
    return NextResponse.json({ error: `Send failed: ${err instanceof Error ? err.message : String(err)}`, ref }, { status: 500 })
  }

  await supabase.from('booking_changelog').insert({
    booking_id: bookingId,
    action: 'email_sent',
    description: `📧 Booking confirmation + check-in link sent to ${to}`,
    changed_by_email: user.email ?? null,
  })

  await auditStaff(supabase, user, 'confirmation_sent', 'booking', bookingId, `Booking confirmation + check-in link sent to ${to}`, { to })
  return NextResponse.json({ ok: true, to })
}
