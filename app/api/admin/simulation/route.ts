import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { auditStaff } from '@/lib/auditServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/simulation  { enabled: boolean }  (nur Admin)
 * Schaltet den globalen Simulationsmodus (app_settings.simulation_mode) und schreibt ins Audit-Log.
 * Genutzt vom Dashboard-Banner und vom Finances-Tab.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: { user }, error: uErr } = await db.auth.getUser(authHeader.slice(7))
  if (uErr || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ ok: false, error: 'Forbidden — admin only' }, { status: 403 })

  let body: { enabled?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }
  if (typeof body.enabled !== 'boolean') return NextResponse.json({ ok: false, error: 'enabled (boolean) required' }, { status: 400 })

  const { data: prev } = await db.from('app_settings').select('value').eq('key', 'simulation_mode').maybeSingle()
  const wasOn = Boolean((prev?.value as { enabled?: boolean } | null)?.enabled)
  const { error } = await db.from('app_settings')
    .update({ value: { enabled: body.enabled }, updated_at: new Date().toISOString() })
    .eq('key', 'simulation_mode')
  if (error) return NextResponse.json({ ok: false, error: `Could not save simulation mode: ${error.message}` }, { status: 500 })

  await auditStaff(db, user, 'setting_changed', 'setting', null,
    `Simulation mode ${body.enabled ? 'started' : 'stopped'} (test data ${body.enabled ? 'visible' : 'hidden'})`,
    { key: 'simulation_mode', enabled: body.enabled }, { enabled: wasOn })
  return NextResponse.json({ ok: true, enabled: body.enabled })
}
