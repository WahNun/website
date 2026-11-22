import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ensureInstructorTicket } from '@/lib/booking'
import { auditStaff } from '@/lib/auditServer'

// POST /api/bookings/instructor-ticket { booking_id }
// Staff only. Walk-in mit „⏱ TBD"-Sessions: Ticket für den Instructor anlegen (idempotent).
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
    .from('bookings').select('id, product_name, customer_name, customer_email, group_size').eq('id', body.booking_id).maybeSingle()
  if (bErr) return NextResponse.json({ error: `Load failed: ${bErr.message}` }, { status: 500 })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  const { data: sess } = await supabase.from('booking_sessions').select('session_date, session, notes').eq('booking_id', booking.id).eq('status', 'booked').order('session_date')
  const tbdDays = (sess ?? []).filter(x => x.session === 'tbd').map(x => `${x.session_date}${x.notes ? ` (${x.notes})` : ''}`)
  const r = await ensureInstructorTicket(supabase, {
    bookingId: booking.id, productName: booking.product_name ?? 'course', customerName: booking.customer_name,
    customerEmail: booking.customer_email, groupSize: booking.group_size ?? 1, tbdDays,
  })
  if (r.error) return NextResponse.json({ error: r.error }, { status: 500 })
  await auditStaff(supabase, user, 'instructor_ticket', 'booking', booking.id, `Instructor ticket ${r.created ? 'created' : 'already existed'} (${tbdDays.length} open day(s))`, { created: r.created, tbd_days: tbdDays })
  return NextResponse.json({ ok: true, created: r.created, tbd_days: tbdDays.length })
}
