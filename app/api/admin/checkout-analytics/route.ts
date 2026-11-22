import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/** GET /api/admin/checkout-analytics?from=ISO&to=ISO&device=&product=&include_test=1&cohort= — Admin only. */

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = getServiceClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })

  const q = req.nextUrl.searchParams
  const from = q.get('from'); const to = q.get('to')
  if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    return NextResponse.json({ error: 'from and to (ISO dates) required' }, { status: 400 })
  }
  const { data, error } = await supabase.rpc('checkout_analytics', {
    p_from: new Date(from).toISOString(),
    p_to: new Date(to).toISOString(),
    p_device: q.get('device') || null,
    p_product: q.get('product') || null,
    p_include_test: q.get('include_test') === '1',
    p_cohort: q.get('cohort') || null,
    p_channel: q.get('channel') || null,
  })
  if (error) return NextResponse.json({ error: `Query failed: ${error.message}` }, { status: 500 })
  return NextResponse.json(data ?? {})
}
