import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPaymentRequestEmail } from '@/lib/email'
import { reportError } from '@/lib/errors'
import { auditStaff, auditEur } from '@/lib/auditServer'

export const runtime = 'nodejs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

function getServiceClient(): Db {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

interface SendPaymentRequestBody {
  /** UUID of existing booking — OR omit and provide inline_* fields for pre-booking emails */
  booking_id?: string
  /** Alternative: look up booking by Stripe session ID */
  stripe_session_id?: string
  /** 'link' | 'bank' | 'revolut' */
  payment_method: string
  /** true = send only 50% now */
  is_deposit?: boolean
  /** Email to send to (required when no booking_id) */
  to_email?: string
  /** Guest name to show */
  guest_name?: string
  /** The Stripe checkout URL — required when payment_method = 'link' */
  checkout_url?: string
  /** Override amount in cents */
  amount_cents?: number
  /** Full booking total in cents — required for deposit emails so email shows correct percentage */
  total_amount_cents?: number
  /** Inline fields — used when no booking exists yet (e.g. standard Stripe before webhook) */
  inline_product_name?: string
  inline_sessions?: Array<{ date: string; session: string }>
  inline_is_test?: boolean
}

// POST /api/send-payment-request
// Authenticated (staff only): looks up a booking (or uses inline data),
// and sends a payment-request email via the shared sendPaymentRequestEmail helper.
export async function POST(req: NextRequest) {
  // ── Auth: require staff session ──────────────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || !['admin', 'staff', 'front_office'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  let body: SendPaymentRequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    booking_id, stripe_session_id, payment_method, is_deposit,
    checkout_url, guest_name,
    inline_product_name, inline_sessions, inline_is_test,
  } = body

  if (!booking_id && !stripe_session_id && !inline_product_name) {
    return NextResponse.json({ error: 'booking_id, stripe_session_id or inline_product_name is required' }, { status: 400 })
  }
  if (!['link', 'bank', 'bank_transfer', 'revolut', 'revolut_link'].includes(payment_method ?? '')) {
    return NextResponse.json({ error: 'payment_method must be link, bank, or revolut' }, { status: 400 })
  }
  if (payment_method === 'link' && !checkout_url) {
    return NextResponse.json({ error: 'checkout_url is required for payment_method=link' }, { status: 400 })
  }

  // ── Load booking (if available) ──────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let booking: any = null
  let usedBookingId = booking_id

  if (booking_id) {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, product_name, customer_email, customer_name, booking_date, session, amount, is_test, status')
      .eq('id', booking_id)
      .maybeSingle()
    if (!error && data) booking = data
  }

  // Fallback: look up by Stripe session ID
  if (!booking && stripe_session_id) {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, product_name, customer_email, customer_name, booking_date, session, amount, is_test, status')
      .eq('stripe_session_id', stripe_session_id)
      .maybeSingle()
    if (!error && data) {
      booking = data
      usedBookingId = data.id
    }
  }

  // ── Compute amount due ───────────────────────────────────────────────────
  let amountCents: number
  let totalCents: number = 0
  let paidSoFar = 0 // bereits bezahlt: die Mail nennt bei einer Teilzahlung Gesamtbetrag, bezahlt und offen

  if (booking) {
    totalCents = booking.amount ?? 0

    // Sum already-received payments
    const { data: payments } = await supabase
      .from('booking_payments')
      .select('amount, status')
      .eq('booking_id', usedBookingId)

    const paidCents = (payments ?? [])
      .filter((p: { status: string }) => p.status === 'paid') // Audit AZD-003: war 'received' → paidCents immer 0
      .reduce((sum: number, p: { amount: number }) => sum + (p.amount ?? 0), 0)

    const remainingCents = Math.max(0, totalCents - paidCents)
    paidSoFar = paidCents

    if (body.amount_cents && body.amount_cents > 0) {
      amountCents = body.amount_cents
    } else if (is_deposit) {
      amountCents = Math.ceil((paidCents === 0 ? totalCents : remainingCents) / 2)
    } else {
      amountCents = remainingCents
    }
  } else {
    // Inline mode: no booking in DB yet (e.g. standard Stripe pre-webhook)
    if (!body.amount_cents || body.amount_cents <= 0) {
      return NextResponse.json({ error: 'amount_cents is required when no booking is found' }, { status: 400 })
    }
    amountCents = body.amount_cents
    totalCents = body.total_amount_cents ?? body.amount_cents
  }

  if (amountCents <= 0) {
    return NextResponse.json({ error: 'No balance due on this booking' }, { status: 400 })
  }

  // ── Build sessions list for the email ────────────────────────────────────
  let emailSessions: { date: string; session: string }[] = []
  if (inline_sessions && inline_sessions.length > 0) {
    emailSessions = inline_sessions
  } else if (booking?.booking_date && booking?.session) {
    emailSessions = [{ date: booking.booking_date, session: booking.session }]
  }

  const toEmail = body.to_email ?? booking?.customer_email
  if (!toEmail) {
    return NextResponse.json({ error: 'No email address for this booking' }, { status: 400 })
  }

  const productName = inline_product_name ?? booking?.product_name ?? 'Dive experience'
  const isTest = inline_is_test ?? booking?.is_test ?? false

  // ── Send email ────────────────────────────────────────────────────────────
  try {
    const result = await sendPaymentRequestEmail({
      to: toEmail,
      guestName: guest_name ?? booking?.customer_name ?? null,
      productName,
      sessions: emailSessions,
      amountCents,
      totalAmountCents: is_deposit || paidSoFar > 0 ? totalCents : undefined,
      paidCents: paidSoFar,
      isDeposit: !!is_deposit,
      checkoutUrl: checkout_url,
      paymentMethod: payment_method,
      isTest,
      bookingId: usedBookingId ?? stripe_session_id ?? 'inline',
    })

    if (!result.ok) {
      const ref = await reportError('pay-req', new Error(result.error ?? 'mail send failed'), {
        route: '/api/send-payment-request', booking_id: usedBookingId,
      })
      return NextResponse.json({ error: result.error ?? 'Mail delivery failed', ref }, { status: 502 })
    }

    await auditStaff(supabase, user, 'payment_request_sent', 'booking', usedBookingId ?? null,
      `Payment request sent (${payment_method}): ${auditEur(amountCents)} to ${toEmail}${is_deposit ? ' — 50% deposit' : ''}`,
      { amount_cents: amountCents, to: toEmail, method: payment_method, is_deposit: !!is_deposit, stripe_session_id: stripe_session_id ?? null })
    return NextResponse.json({ ok: true, amount_cents: amountCents, to: toEmail })
  } catch (e) {
    const ref = await reportError('pay-req', e, { route: '/api/send-payment-request', booking_id: usedBookingId })
    return NextResponse.json({ error: 'Failed to send email', ref }, { status: 500 })
  }
}
