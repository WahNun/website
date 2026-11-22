import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripeIsLiveKey, stripeLiveAllowed, sanitizeKey, stripeTestConfigured } from '@/lib/stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Which Stripe account is this server actually talking to?
 *
 * Read from the key that is really loaded, not from a setting someone could
 * forget to update. During the sandbox phase the production environment carries
 * a test key on purpose — the danger is going live and not noticing it is still
 * there. Staff must be able to see the real answer at a glance.
 *
 * Behind auth: whether payments are real is not something we tell the world.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data: { user }, error } = await supabase.auth.getUser(auth.slice(7))
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'front_office' && profile?.role !== 'staff') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const raw = process.env.STRIPE_SECRET_KEY ?? ''
  const { key, stripped } = sanitizeKey(raw)
  const configured = key.length > 0
  const live = stripeIsLiveKey()

  // Diagnose ohne den Key preiszugeben: Länge, wie viel weggeworfen wurde und
  // das Präfix (sk_test_ / sk_live_ ist kein Geheimnis). Reicht, um zu sehen,
  // ob überhaupt ein Key ankommt oder etwas anderes.
  const diagnostics = {
    raw_length: raw.length,
    clean_length: key.length,
    stripped,
    prefix: key.slice(0, 8) || raw.replace(/[^\x21-\x7E]/g, '').slice(0, 8) || '(nichts Druckbares)',
    webhook_raw_length: (process.env.STRIPE_WEBHOOK_SECRET ?? '').length,
    webhook_clean_length: sanitizeKey(process.env.STRIPE_WEBHOOK_SECRET).key.length,
  }

  return NextResponse.json({
    configured,
    mode: !configured ? 'missing' : live ? 'live' : 'test',
    live_allowed: stripeLiveAllowed(),
    test_key_configured: stripeTestConfigured() && sanitizeKey(process.env.STRIPE_TEST_WEBHOOK_SECRET).key.length > 0,
    webhook_configured: sanitizeKey(process.env.STRIPE_WEBHOOK_SECRET).key.length > 0,
    diagnostics,
  })
}
