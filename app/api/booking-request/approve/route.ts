import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff } from '@/lib/staffAuth'
import { canWorkLive } from '@/lib/liveAccess'
import { reportError } from '@/lib/errors'
import { auditStaff } from '@/lib/auditServer'
import { loadRequestBooking, requestCapacityCheck, approveRequest, fmtOverSlots } from '@/lib/requestCheckout'

export const runtime = 'nodejs'

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

/**
 * POST /api/booking-request/approve  { booking_id, mode: 'full' | 'deposit', resend?: boolean }  (Staff)
 * Freigabe: Kapazität prüfen, request_state → approved, Mail „Your dive day is set — please confirm". KEIN Stripe-Link —
 * der entsteht erst, wenn der Gast auf Confirm klickt (/request/<token>). `resend` schickt die Mail erneut (approved/expired).
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(req)
  if (auth instanceof NextResponse) return auth
  let body: { booking_id?: string; mode?: string; resend?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const resend = body.resend === true
  const supabase = getServiceClient()
  if (!body.booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })
  const found = await loadRequestBooking(supabase, { id: body.booking_id })
  if (!found) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  const { parent, kids } = found
  const mode = body.mode === 'deposit' ? 'deposit' as const : body.mode === 'full' ? 'full' as const : (resend ? (parent.request_payment_mode ?? 'full') : null)
  if (!mode) return NextResponse.json({ error: 'mode (full | deposit) required' }, { status: 400 })
  if (parent.parent_booking_id) return NextResponse.json({ error: 'This is a linked guest booking — approve the main booking instead' }, { status: 400 })
  const okStates = resend ? ['approved', 'expired'] : ['requested', 'expired']
  if (!okStates.includes(parent.request_state ?? '')) {
    return NextResponse.json({ error: `Request is ${parent.request_state ?? 'not a request'} — ${resend ? 'only approved requests can be re-sent' : 'only open requests can be approved'}` }, { status: 409 })
  }
  if (parent.status !== 'pending') return NextResponse.json({ error: `Booking status is ${parent.status} — expected pending` }, { status: 409 })
  if (!parent.customer_email) return NextResponse.json({ error: 'Booking has no customer email — add one in the guest file first' }, { status: 400 })
  // Wie /api/fo-checkout: Nicht-Admins arbeiten nur mit dem Stripe-Testkonto — ein Live-Request (echtes Geld) braucht einen Admin.
  if (!parent.is_test && !(await canWorkLive(supabase, auth.user.id))) return NextResponse.json({ error: 'Live booking requests (real money) can only be approved by an admin or a team member with Production data access' }, { status: 403 })

  try {
    const { over } = await requestCapacityCheck(supabase, parent, kids)
    if (over.length > 0) {
      return NextResponse.json({ error: `Cannot approve — ${fmtOverSlots(over)}. Move this request to another day (Sessions tab or planner), or free seats on that boat first.`, over_slots: over }, { status: 409 })
    }
    const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin
    const actor = auth.user.email ?? auth.user.id
    const r = await approveRequest(supabase, { parent, kids, mode, origin, actor, resend })
    await auditStaff(supabase, auth.user, resend ? 'request_approval_resent' : 'request_approved', 'booking', parent.id,
      `Booking request ${resend ? 'approval email re-sent' : 'approved'} (${mode}) — €${(r.amountCents / 100).toFixed(2)}, guest asked to confirm (${parent.customer_email})`,
      { mode, amount_cents: r.amountCents, total_cents: r.totalCents, approved_until: r.approvedUntil, kids: kids.map(k => k.id) })
    return NextResponse.json({ ok: true, amount_cents: r.amountCents, approved_until: r.approvedUntil, ...(r.mailError ? { mail_error: r.mailError } : {}) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const ref = await reportError('pay', e, { route: '/api/booking-request/approve', booking_id: parent.id, mode })
    return NextResponse.json({ error: `Approve failed: ${msg}`, ref }, { status: 500 })
  }
}
