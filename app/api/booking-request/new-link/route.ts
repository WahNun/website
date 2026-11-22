import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff } from '@/lib/staffAuth'
import { canWorkLive } from '@/lib/liveAccess'
import { reportError } from '@/lib/errors'
import { auditStaff } from '@/lib/auditServer'
import { loadRequestBooking, requestCapacityCheck, createRequestPaymentLink, fmtOverSlots, summarizeRequest, type RequestBookingRow } from '@/lib/requestCheckout'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

const GUEST_LINKS_PER_HOUR = 3

async function publicView(supabase: ReturnType<typeof getServiceClient>, parent: RequestBookingRow, kids: RequestBookingRow[]) {
  const sum = await summarizeRequest(supabase, parent, kids)
  return {
    reference: parent.id.slice(0, 8).toUpperCase(),
    product_name: sum.productLabel,
    guests: sum.groupSize,
    total_cents: sum.totalCents,
    payment_mode: parent.request_payment_mode,
    request_state: parent.request_state,
    status: parent.status,
    approved_until: parent.approved_until,
    is_test: parent.is_test,
    sessions: sum.uniqSessions,
    dates_changed: sum.datesChanged,
    requested_sessions: sum.datesChanged || sum.shortenedFrom ? sum.requestedSessions : [],
    shortened_from: sum.shortenedFrom,
  }
}

/** GET /api/booking-request/new-link?token=…  — Gastseite /request/<token>: Zusammenfassung ohne persönliche Daten. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')?.trim() ?? ''
  if (!/^[a-f0-9]{32,64}$/i.test(token)) return NextResponse.json({ error: 'Invalid link' }, { status: 400 })
  const supabase = getServiceClient()
  const found = await loadRequestBooking(supabase, { token })
  if (!found) return NextResponse.json({ error: 'This request link is not valid (unknown reference).' }, { status: 404 })
  return NextResponse.json({ ok: true, booking: await publicView(supabase, found.parent, found.kids) })
}

/**
 * POST /api/booking-request/new-link
 *   Gast:  { token }            — „Confirm & pay": Stripe-Session entsteht JETZT (Kapazität wird geprüft), Antwort { url }
 *   Staff: Bearer + { booking_id } — Zahlungs-Session für einen freigegebenen Request erzeugen (z. B. am Tresen)
 */
export async function POST(req: NextRequest) {
  let body: { booking_id?: string; token?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const supabase = getServiceClient()

  let actor = 'guest'
  let staffUser: { id: string; email?: string | null } | null = null
  let staffRole: string | null = null
  let found: Awaited<ReturnType<typeof loadRequestBooking>> = null
  if (req.headers.get('authorization')) {
    const auth = await requireStaff(req)
    if (auth instanceof NextResponse) return auth
    staffUser = auth.user
    staffRole = auth.role
    actor = auth.user.email ?? auth.user.id
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
  if (parent.status !== 'pending') {
    return NextResponse.json({ error: parent.status === 'confirmed' || parent.status === 'completed' ? 'This booking is already paid and confirmed.' : `This booking is ${parent.status} — payment is not possible.` }, { status: 409 })
  }
  if (!['approved', 'expired'].includes(parent.request_state ?? '')) {
    return NextResponse.json({ error: parent.request_state === 'requested' ? 'This request has not been approved yet — we will email you as soon as a dive day comes together.' : `Request is ${parent.request_state ?? 'not a request'} — payment is not possible.` }, { status: 409 })
  }
  if (!parent.customer_email) return NextResponse.json({ error: 'Booking has no customer email' }, { status: 400 })
  if (staffUser && !parent.is_test && !(staffRole === 'admin' || await canWorkLive(supabase, staffUser.id))) return NextResponse.json({ error: 'Live payment links can only be created by an admin or a team member with Production data access' }, { status: 403 })

  if (!staffUser) {
    const since = new Date(Date.now() - 3600_000).toISOString()
    const { count } = await supabase.from('booking_changelog').select('id', { count: 'exact', head: true })
      .eq('booking_id', parent.id).eq('action', 'request_confirmed').gte('changed_at', since)
    if ((count ?? 0) >= GUEST_LINKS_PER_HOUR) return NextResponse.json({ error: 'Too many attempts in the last hour — please use the payment page you already opened, or contact us.' }, { status: 429 })
  }

  try {
    const { over } = await requestCapacityCheck(supabase, parent, kids)
    if (over.length > 0) {
      const note = `request-link-failed:${parent.id}`
      const { data: ex } = await supabase.from('support_tickets').select('id').eq('note', note).maybeSingle()
      if (!ex) {
        await supabase.from('support_tickets').insert({
          name: parent.customer_name || 'Guest', email: parent.customer_email, preferred_channel: 'internal', status: 'open', note,
          message: `Approved request ${parent.id.slice(0, 8)} (${parent.product_name ?? 'booking'}, ${parent.customer_email}) can no longer be paid — seats gone: ${fmtOverSlots(over)}.\nContact the guest with alternatives or plan again in Front Office → Booking Requests.`,
        })
      }
      await supabase.from('booking_changelog').insert({ booking_id: parent.id, action: 'request_link_blocked', description: `⛔ Payment refused (${actor}) — seats no longer available: ${fmtOverSlots(over)}` })
      return NextResponse.json({ error: staffUser
        ? `Not enough seats any more: ${fmtOverSlots(over)}. Plan another day first.`
        : 'Sorry — the boat for this day has filled up in the meantime. The team has been notified and will contact you with alternatives.', over_slots: over }, { status: 409 })
    }
    const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin
    const mode = parent.request_payment_mode ?? 'full'
    const r = await createRequestPaymentLink(supabase, { parent, kids, mode, origin, actor })
    if (staffUser) {
      await auditStaff(supabase, staffUser, 'request_link_created', 'booking', parent.id, `Payment session created for ${parent.customer_email} (${mode})`, { stripe_session_id: r.sessionId, amount_cents: r.amountCents })
    }
    return NextResponse.json({ ok: true, url: r.url, amount_cents: r.amountCents })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const ref = await reportError('pay', e, { route: '/api/booking-request/new-link', booking_id: parent.id, actor })
    return NextResponse.json({ error: `Could not open the payment page: ${msg}`, ref }, { status: 500 })
  }
}
