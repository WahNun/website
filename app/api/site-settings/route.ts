import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSetting, setSetting } from '@/lib/site-settings'
import { auditStaff } from '@/lib/auditServer'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function verifyAdmin(bearerToken: string) {
  const supabase = getServiceClient()
  const { data: { user }, error } = await supabase.auth.getUser(bearerToken)
  if (error || !user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return null
  return user
}

// GET /api/site-settings?key=chatbot_booking_enabled
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })
  const value = await getSetting(key, '')
  return NextResponse.json({ key, value })
}

// POST /api/site-settings  { key, value }  — admin only
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const user = await verifyAdmin(authHeader.slice(7))
  if (!user) return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })

  let body: { key?: string; value?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { key, value } = body
  if (!key || value === undefined) return NextResponse.json({ error: 'key and value required' }, { status: 400 })

  const isSecretKey = /secret|token|password|api_?key/i.test(key)
  const prev = isSecretKey ? null : await getSetting(key, '')
  await setSetting(key, value)
  await auditStaff(getServiceClient(), user, 'setting_changed', 'setting', null,
    `Setting "${key}" changed${isSecretKey ? ' (value hidden)' : `: ${String(prev).slice(0, 120)} → ${String(value).slice(0, 120)}`}`,
    { key, ...(isSecretKey ? {} : { value: String(value).slice(0, 500) }) }, isSecretKey ? null : { value: String(prev).slice(0, 500) })
  return NextResponse.json({ ok: true, key, value })
}
