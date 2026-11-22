import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff } from '@/lib/staffAuth'

// GET /api/staff-names → { names: { "<email lower>": "Name" } }
// Für Anzeigen wie „requested by …" im Front Office / Finances. Front-Office-Rollen dürfen fremde Profile per RLS
// nicht lesen, daher Service-Role. Liefert nur Namen, keine Rollen oder Daten.
export async function GET(req: NextRequest) {
  try { return await handle(req) } catch (e) { return NextResponse.json({ ok: false, error: `staff-names: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 }) }
}

async function handle(req: NextRequest) {
  const auth = await requireStaff(req)
  if (auth instanceof NextResponse) return auth
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: profs, error } = await supabase.from('profiles').select('id, name, email')
  if (error) return NextResponse.json({ ok: false, error: `Profiles: ${error.message}` }, { status: 500 })
  const nameById = new Map((profs ?? []).map(p => [p.id as string, (p.name as string | null)?.trim() || null]))
  const names: Record<string, string> = {}
  for (const p of profs ?? []) if (p.email && p.name?.trim()) names[String(p.email).toLowerCase()] = p.name.trim()
  // Zusätzlich per User-ID (Schlüssel id:<uuid>) für Felder wie booking_payments.recorded_by
  for (const p of profs ?? []) { const n = nameById.get(p.id as string); if (n) names[`id:${String(p.id).toLowerCase()}`] = n }
  // Login-E-Mail steht in auth.users — bei manchen Profilen (z. B. Inhaber) ist profiles.email leer.
  // listUsers schlägt bei manchen Projekten mit „Database error finding users" fehl → dann pro Profil getUserById.
  let listed = false
  try {
    const { data: list, error: lErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (!lErr && list?.users) {
      listed = true
      for (const u of list.users) {
        const n = nameById.get(u.id)
        if (u.email && n) names[u.email.toLowerCase()] = n
      }
    } else if (lErr) console.warn('[staff-names] listUsers failed:', lErr.message)
  } catch (e) { console.warn('[staff-names] listUsers threw:', e instanceof Error ? e.message : String(e)) }
  if (!listed) {
    await Promise.all((profs ?? []).filter(p => nameById.get(p.id as string)).map(async p => {
      try {
        const { data } = await supabase.auth.admin.getUserById(p.id as string)
        const em = data?.user?.email
        if (em) names[em.toLowerCase()] = nameById.get(p.id as string)!
      } catch { /* ignorieren — Profil ohne Login */ }
    }))
  }
  return NextResponse.json({ ok: true, names })
}
