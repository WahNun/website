import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSessionTimesEmail } from '@/lib/email'
import { auditStaff } from '@/lib/auditServer'

// POST /api/bookings/session-times  { booking_id }
// Staff only. Schickt dem Gast die (vom Instructor gesetzten) Startzeiten aller Sessions der Buchung.
// Wird aus dem FO Sessions-Tab aufgerufen, sobald das letzte 'tbd'-Zeitfenster gesetzt ist.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile || !['admin', 'staff'].includes(profile.role ?? '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { booking_id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })

  const { data: booking, error: bErr } = await supabase
    .from('bookings').select('id, customer_name, customer_email, product_name, is_test').eq('id', body.booking_id).maybeSingle()
  if (bErr) return NextResponse.json({ error: `Load failed: ${bErr.message}` }, { status: 500 })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (!booking.customer_email) return NextResponse.json({ error: 'Booking has no customer email' }, { status: 400 })

  const { data: sessions } = await supabase
    .from('booking_sessions').select('session_date, session, notes, start_time').eq('booking_id', booking.id).eq('status', 'booked').order('session_date')
  const list = (sessions ?? []).map(x => ({ date: x.session_date, session: x.session, notes: x.notes, startTime: x.start_time }))
  if (list.length === 0) return NextResponse.json({ error: 'No sessions on this booking' }, { status: 400 })

  const res = await sendSessionTimesEmail({
    to: booking.customer_email,
    customerName: booking.customer_name,
    productName: booking.product_name ?? 'Your course',
    sessions: list,
    isTest: !!booking.is_test,
    bookingId: booking.id,
  })
  if (!res.ok) return NextResponse.json({ error: res.error ?? 'Email failed' }, { status: 502 })
  await supabase.from('booking_changelog').insert({
    booking_id: booking.id, action: 'email_sent', description: `📧 Start times sent to ${booking.customer_email}`, changed_by_email: user.email ?? null,
  })
  await auditStaff(supabase, user, 'start_times_sent', 'booking', booking.id, `Start times mailed to ${booking.customer_email}`, { to: booking.customer_email })
  return NextResponse.json({ ok: true })
}
