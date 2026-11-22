import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff } from '@/lib/staffAuth'
import { reportError } from '@/lib/errors'
import { auditStaff } from '@/lib/auditServer'
import { loadRequestBooking, reopenRequest, restoreOriginalRequest } from '@/lib/requestCheckout'

export const runtime = 'nodejs'

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

/**
 * POST /api/booking-request/reopen
 *   Gast:  { token, message }                     — „This doesn't work for me": zurück auf requested, Ticket, „Got it"-Mail
 *   Staff: Bearer + { booking_id, note?, restore? } — Reopen (ggf. mit Wiederherstellung des Originals nach Kürzung)
 */
export async function POST(req: NextRequest) {
  let body: { booking_id?: string; token?: string; message?: string; note?: string; restore?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const supabase = getServiceClient()
  let staffUser: { id: string; email?: string | null } | null = null
  let actor = 'guest'
  let found: Awaited<ReturnType<typeof loadRequestBooking>> = null
  if (req.headers.get('authorization')) {
    const auth = await requireStaff(req)
    if (auth instanceof NextResponse) return auth
    staffUser = auth.user; actor = auth.user.email ?? auth.user.id
    if (!body.booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })
    found = await loadRequestBooking(supabase, { id: body.booking_id })
  } else {
    const token = (body.token ?? '').trim()
    if (!/^[a-f0-9]{32,64}$/i.test(token)) return NextResponse.json({ error: 'Invalid link' }, { status: 400 })
    found = await loadRequestBooking(supabase, { token })
  }
  if (!found) return NextResponse.json({ error: 'This request link is not valid (unknown reference).' }, { status: 404 })
  const { parent, kids } = found
  if (parent.parent_booking_id) return NextResponse.json({ error: 'This is a linked guest booking — use the main booking' }, { status: 400 })
  if (parent.status !== 'pending') return NextResponse.json({ error: parent.status === 'confirmed' || parent.status === 'completed' ? 'This booking is already paid — please reply to your confirmation email if something needs to change.' : `This booking is ${parent.status}.` }, { status: 409 })
  if (!['approved', 'expired'].includes(parent.request_state ?? '')) return NextResponse.json({ error: `Request is ${parent.request_state ?? '—'} — nothing to reopen` }, { status: 409 })
  const { data: paid } = await supabase.from('booking_payments').select('id').in('booking_id', [parent.id, ...kids.map(k => k.id)]).eq('status', 'paid').limit(1)
  if (paid && paid.length > 0) return NextResponse.json({ error: staffUser ? 'A payment is already recorded — use Cancel booking (refund flow) instead' : 'A payment for this booking has already been received — please reply to your confirmation email if something needs to change.' }, { status: 409 })
  const message = (staffUser ? body.note : body.message) ?? ''
  if (!staffUser && message.trim().length > 1000) return NextResponse.json({ error: 'Message too long (max 1000 characters)' }, { status: 400 })

  try {
    let restored = false
    if (staffUser && body.restore) {
      const r = await restoreOriginalRequest(supabase, { parent, kids, actor })
      if (!r.restored) return NextResponse.json({ error: `Could not restore the original request: ${r.error}` }, { status: 409 })
      restored = true
    }
    const r = await reopenRequest(supabase, { parent, kids, actor, byGuest: !staffUser, message })
    if (staffUser) await auditStaff(supabase, staffUser, 'request_reopened', 'booking', parent.id, `Booking request reopened${restored ? ' (original restored)' : ''}${message ? `: ${message.slice(0, 200)}` : ''}`, { restored, kids: kids.map(k => k.id) })
    return NextResponse.json({ ok: true, restored, ...(r.mailError ? { mail_error: r.mailError } : {}) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const ref = await reportError('pay', e, { route: '/api/booking-request/reopen', booking_id: parent.id, actor })
    return NextResponse.json({ error: `Reopen failed: ${msg}`, ref }, { status: 500 })
  }
}
