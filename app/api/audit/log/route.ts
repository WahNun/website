import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff } from '@/lib/staffAuth'
import { auditStaff } from '@/lib/auditServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/audit/log  (staff only) — Front-Office-Aktionen, die der Browser direkt in die DB schreibt
 * (Notizen, Status, Zahlungen erfassen, Sessions, Paketwechsel …), landen hier zusaetzlich im audit_log.
 * Body: { booking_id, action, description, field?, old_value?, new_value? }  → action_type = `fo_<action>`.
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(req)
  if (auth instanceof NextResponse) return auth

  let body: { booking_id?: string; action?: string; description?: string; field?: string | null; old_value?: string | null; new_value?: string | null }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }
  const { booking_id, action, description } = body
  if (!booking_id || !/^[0-9a-f-]{36}$/i.test(booking_id)) return NextResponse.json({ ok: false, error: 'valid booking_id required' }, { status: 400 })
  if (!action || !/^[a-z0-9_]{1,60}$/.test(action)) return NextResponse.json({ ok: false, error: 'action (a-z0-9_) required' }, { status: 400 })
  if (!description) return NextResponse.json({ ok: false, error: 'description required' }, { status: 400 })

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const err = await auditStaff(db, auth.user, `fo_${action}`, 'booking', booking_id, String(description).slice(0, 1000),
    { field: body.field ?? null, new: body.new_value ?? null }, body.old_value != null ? { value: body.old_value } : null)
  if (err) return NextResponse.json({ ok: false, error: `Audit insert failed: ${err}` }, { status: 500 })
  return NextResponse.json({ ok: true })
}
