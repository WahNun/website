import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe, assertStripeMode } from '@/lib/stripe'
import { reportError } from '@/lib/errors'
import { auditStaff, auditEur } from '@/lib/auditServer'

export const runtime = 'nodejs'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

interface FoCheckoutBody {
  /** Custom amount in cents — the exact amount the guest should pay */
  amount_cents: number
  product_name: string
  /** Guest email — used to pre-fill Stripe checkout */
  customer_email: string
  sessions: { date: string; session: string }[]
  /** Booking ID to store in the pending booking */
  booking_id?: string
  /** If true this is a 50% deposit; the full total is total_cents */
  is_deposit?: boolean
  total_cents?: number
  /** Gäste — landet in metadata.group_size (Audit AZD-012: war hart '1') */
  group_size?: number
}

// POST /api/fo-checkout
// Authenticated (staff only): creates a Stripe checkout session with a custom
// amount. Bypasses terms acceptance and availability checks — those are already
// handled by the front office booking flow.
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

  // Check staff role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role,data_access')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || !['admin', 'staff', 'front_office'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Stripe mode guard ────────────────────────────────────────────────────
  // Data access = sandbox: immer Testkonto. Admin oder Data access = production: Live, ausser is_test im Body.
  const stripeMode = !(profile.role === 'admin' || profile.data_access === 'production') || (await req.clone().json().catch(() => ({})))?.is_test === true ? 'test' as const : 'live' as const
  try {
    assertStripeMode(stripeMode)
  } catch {
    return NextResponse.json({ error: stripeMode === 'test' ? 'Stripe test mode is not configured.' : 'Checkout is not configured.' }, { status: 503 })
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  let body: FoCheckoutBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { amount_cents, product_name, customer_email, sessions, is_deposit, total_cents } = body

  if (!amount_cents || amount_cents < 100) {
    return NextResponse.json({ error: 'amount_cents must be >= 100' }, { status: 400 })
  }
  if (!product_name) {
    return NextResponse.json({ error: 'product_name is required' }, { status: 400 })
  }
  if (!customer_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email)) {
    return NextResponse.json({ error: 'Valid customer_email is required' }, { status: 400 })
  }
  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ error: 'sessions is required' }, { status: 400 })
  }

  const origin = req.headers.get('origin')
    ?? process.env.NEXT_PUBLIC_SITE_URL
    ?? new URL(req.url).origin

  const depositLabel = is_deposit
    ? ` — 50% deposit (full price €${((total_cents ?? amount_cents * 2) / 100).toFixed(2)})`
    : ''

  // KeyInvoice: ohne Produkt-ID im Stripe-Produkt findet der Webhook keine Rechnungsposition („Keine fakturierbaren
  // Positionen“). Produkt per Name in course_prices suchen (genau ein Treffer) und als course_price_id mitgeben —
  // der Webhook mappt darüber auf keyinvoice_product_id. Kein Treffer (z. B. freier Betrag): wie bisher ohne ID.
  let coursePriceId: string | null = null
  try {
    const { data: cp } = await supabase.from('course_prices').select('id').ilike('name', product_name.trim()).limit(2)
    if (cp && cp.length === 1) coursePriceId = cp[0].id as string
    else console.warn(`[fo-checkout] kein eindeutiges course_prices-Produkt fuer "${product_name}" (${cp?.length ?? 0} Treffer) — Rechnung braucht manuelle Zuordnung`)
  } catch (e) { console.warn('[fo-checkout] course_prices lookup failed:', e) }

  try {
    const checkoutSession = await getStripe(stripeMode).checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: amount_cents,
          product_data: {
            name: `${product_name}${depositLabel}`,
            description: sessions.map(x => `${x.date} ${(x.session as string).toUpperCase()}`).join(' · ').slice(0, 300),
            ...(coursePriceId ? { metadata: { course_price_id: coursePriceId } } : {}),
          },
        },
      }],
      customer_email,
      tax_id_collection: { enabled: true },
      billing_address_collection: 'auto',
      metadata: {
        source: 'fo_checkout',
        product_name,
        booking_date: sessions[0].date,
        session: sessions[0].session,
        sessions: sessions.map(x => `${x.date}:${x.session}`).join(','),
        group_size: String(Math.max(1, Math.min(20, Math.floor(Number(body.group_size) || 1)))),
        ...(body.booking_id ? { fo_booking_id: body.booking_id } : {}),
        // Audit AZD-004: total_cents IMMER mitgeben — sonst gilt ein 1-€-Link als „voll bezahlt"
        total_cents: String(total_cents ?? amount_cents),
        ...(is_deposit ? { is_deposit: 'true' } : {}),
      },
      success_url: `${origin}/checkin/start?session_id={CHECKOUT_SESSION_ID}&src=fo`, // src=fo: Telemetrie trennt Front-Office-Verkäufe vom Kunden-Funnel
      cancel_url: `${origin}/`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    })

    await auditStaff(supabase, user, 'checkout_link_created', 'checkout_session', null,
      `Stripe checkout link created: ${auditEur(amount_cents)} for ${product_name} (${customer_email})${is_deposit ? ' — 50% deposit' : ''}`,
      { stripe_session_id: checkoutSession.id, amount_cents, total_cents: total_cents ?? amount_cents, product_name, customer_email, is_deposit: !!is_deposit, booking_id: body.booking_id ?? null })
    return NextResponse.json({ url: checkoutSession.url, id: checkoutSession.id })
  } catch (e) {
    const ref = await reportError('fo-checkout', e, {
      route: '/api/fo-checkout', product_name, amount_cents,
    })
    return NextResponse.json({ error: 'Could not start checkout', ref }, { status: 500 })
  }
}
