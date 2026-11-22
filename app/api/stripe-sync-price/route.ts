import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const STRIPE_API = 'https://api.stripe.com/v1'

function stripeHeaders() {
  return {
    Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  }
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  // ── 1. Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  const supabase = getServiceClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Role check — admin only ───────────────────────────────────────────────
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── 3. Parse & validate body ─────────────────────────────────────────────────
  let product_id: string, new_price_cents: number
  try {
    const body = await req.json()
    product_id = body.product_id
    new_price_cents = body.new_price_cents
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!product_id || typeof new_price_cents !== 'number' || new_price_cents < 0) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }

  // ── 4. List current active Stripe prices for this product ────────────────────
  const listRes = await fetch(
    `${STRIPE_API}/prices?product=${encodeURIComponent(product_id)}&active=true&limit=10`,
    { headers: stripeHeaders() }
  )
  if (!listRes.ok) {
    const err = await listRes.json()
    return NextResponse.json({ error: 'Stripe list failed', detail: err }, { status: 502 })
  }
  const { data: activePrices } = (await listRes.json()) as { data: { id: string; unit_amount: number }[] }

  // ── 5. Create new price ──────────────────────────────────────────────────────
  const createRes = await fetch(`${STRIPE_API}/prices`, {
    method: 'POST',
    headers: stripeHeaders(),
    body: new URLSearchParams({
      product: product_id,
      unit_amount: String(new_price_cents),
      currency: 'eur',
    }),
  })
  if (!createRes.ok) {
    const err = await createRes.json()
    return NextResponse.json({ error: 'Stripe create failed', detail: err }, { status: 502 })
  }
  const newPrice = await createRes.json() as { id: string }

  // ── 6. Deactivate old prices ─────────────────────────────────────────────────
  for (const old of activePrices) {
    await fetch(`${STRIPE_API}/prices/${old.id}`, {
      method: 'POST',
      headers: stripeHeaders(),
      body: new URLSearchParams({ active: 'false' }),
    })
  }

  return NextResponse.json({
    ok: true,
    new_price_id: newPrice.id,
    deactivated: activePrices.map(p => p.id),
  })
}
