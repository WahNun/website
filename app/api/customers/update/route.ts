import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff } from '@/lib/staffAuth'
import { auditStaff } from '@/lib/auditServer'

/**
 * POST /api/customers/update — Staff trägt Profildaten nach (Gästeakte): Geburtsdatum, Name, Geschlecht, Land, Telefon.
 * { customer_id, booking_id?, fields: { first_name?, last_name?, gender?, dob?, nationality?, country_of_residence?, phone_prefix?, phone_number? } }
 * Änderungen werden ins Buchungs-Log geschrieben (welches Feld, alt → neu, wer).
 */
const ALLOWED = ['first_name', 'last_name', 'gender', 'dob', 'nationality', 'country_of_residence', 'phone_prefix', 'phone_number'] as const
type Field = typeof ALLOWED[number]

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req)
  if (auth instanceof NextResponse) return auth
  const { user } = auth
  let body: { customer_id?: string; booking_id?: string; fields?: Partial<Record<Field, string | null>> }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.customer_id || !body.fields) return NextResponse.json({ ok: false, error: 'customer_id and fields required' }, { status: 400 })

  const patch: Record<string, string | null> = {}
  for (const k of ALLOWED) {
    if (!(k in body.fields)) continue
    const raw = body.fields[k]
    const v = typeof raw === 'string' ? raw.trim() : null
    if (k === 'dob' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return NextResponse.json({ ok: false, error: 'Date of birth must be YYYY-MM-DD' }, { status: 400 })
    if (k === 'dob' && v && new Date(v) > new Date()) return NextResponse.json({ ok: false, error: 'Date of birth is in the future' }, { status: 400 })
    if (k === 'gender' && v && !['M', 'F', 'X'].includes(v.toUpperCase())) return NextResponse.json({ ok: false, error: 'Gender must be M, F or X' }, { status: 400 })
    patch[k] = v ? (k === 'gender' ? v.toUpperCase() : v) : null
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: false, error: 'No changes' }, { status: 400 })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: before } = await supabase.from('customers').select('id, ' + ALLOWED.join(', ')).eq('id', body.customer_id).maybeSingle()
  if (!before) return NextResponse.json({ ok: false, error: 'Customer not found' }, { status: 404 })
  const beforeRec = before as unknown as Record<string, string | null>

  const diff = Object.entries(patch).filter(([k, v]) => (beforeRec[k] ?? null) !== v)
  if (diff.length === 0) return NextResponse.json({ ok: true, changed: [] })

  // Name zusammensetzen, falls Vor-/Nachname geändert
  const full = { ...beforeRec, ...patch }
  if ('first_name' in patch || 'last_name' in patch) patch.name = [full.first_name, full.last_name].filter(Boolean).join(' ') || null

  const { error } = await supabase.from('customers').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', body.customer_id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await auditStaff(supabase, user, 'customer_profile_updated', 'customer', body.customer_id,
    `Guest profile updated: ${diff.map(([k, v]) => `${k} ${beforeRec[k] ?? '—'} → ${v ?? '—'}`).join(', ')}`,
    { booking_id: body.booking_id ?? null, fields: Object.fromEntries(diff) }, Object.fromEntries(diff.map(([k]) => [k, beforeRec[k] ?? null])))
  if (body.booking_id) {
    await supabase.from('booking_changelog').insert({
      booking_id: body.booking_id, action: 'profile_updated', changed_by_email: user.email ?? null,
      description: `👤 Guest profile updated by ${user.email ?? 'staff'}: ${diff.map(([k, v]) => `${k} ${beforeRec[k] ?? '—'} → ${v ?? '—'}`).join(', ')}`,
    })
  }
  return NextResponse.json({ ok: true, changed: diff.map(([k]) => k) })
}
