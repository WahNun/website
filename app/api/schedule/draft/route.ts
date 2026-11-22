import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/staffAuth'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function addDays(date: string, n: number): string {
  const d = new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000)
  return d.toISOString().slice(0, 10)
}

// Skill-Level Ranking: höher = mehr Qualifikation
const LEVEL_RANK: Record<string, number> = {
  dg: 1, dm: 2, dmi: 3, owi: 4, ait: 5,
}

// Mindest-Level für Guide-Rolle
const MIN_GUIDE_LEVEL = 2 // dm oder höher

type ScheduleEntry = { name: string; role: string; start: string; end: string }

/**
 * POST /api/schedule/draft
 * Body: { week_monday: "YYYY-MM-DD", dry_run?: boolean }
 *
 * Liest monthly_roster + bookings für die Woche,
 * berechnet Besetzung pro Tag/Session und schreibt schedule_data.
 * Mit dry_run=true nur Vorschau, kein Schreiben.
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(req)
  if (auth instanceof NextResponse) return auth

  const body = await req.json().catch(() => ({}))
  const { week_monday, dry_run = false } = body as { week_monday?: string; dry_run?: boolean }

  if (!week_monday || !/^\d{4}-\d{2}-\d{2}$/.test(week_monday)) {
    return NextResponse.json({ error: 'week_monday fehlt oder ungültig (YYYY-MM-DD)' }, { status: 400 })
  }

  const db = serviceClient()

  // Schedule folgt dem globalen Sandbox-Schalter: in Sandbox entstehen Test-Zellen, die Echt-Zellen bleiben unberührt.
  const { data: simRow } = await db.from('app_settings').select('value').eq('key', 'simulation_mode').maybeSingle()
  const sandbox = Boolean((simRow?.value as { enabled?: boolean } | null)?.enabled)

  // 1. Regeln lesen
  const { data: rulesRow } = await db.from('app_settings').select('value').eq('key', 'schedule_rules').maybeSingle()
  const rules = (rulesRow?.value ?? {}) as {
    guide_ratio?: number
    guide_ratio_max?: number
    am_hours?: string
    pm_hours?: string
  }
  const RATIO = rules.guide_ratio ?? 4
  const AM = rules.am_hours ?? '07:30-13:30'
  const PM = rules.pm_hours ?? '11:00-20:00'
  const [amStart, amEnd] = AM.split('-')
  const [pmStart, pmEnd] = PM.split('-')

  // 2. Alle Profile mit Qualifikationen
  const { data: profiles } = await db
    .from('profiles')
    .select('id,name,dive_role,is_skipper,qualifications')
    .eq('company', 'azd')
  const allProfiles = profiles ?? []

  // 3. Woche aufbauen: 7 Tage ab week_monday
  const weekDays = Array.from({ length: 7 }, (_, i) => ({
    date: addDays(week_monday, i),
    idx: i,
  }))
  const dateFrom = weekDays[0].date
  const dateTo = weekDays[6].date

  // 4. Monthly Roster für die Woche
  const { data: roster } = await db
    .from('monthly_roster')
    .select('profile_id,work_date,shift_type,start_time,end_time')
    .gte('work_date', dateFrom)
    .lte('work_date', dateTo)

  // Lookup: date → profile_ids die arbeiten (am / pm / full)
  const rosterByDate = new Map<string, { profileId: string; shift: string }[]>()
  for (const row of roster ?? []) {
    if (row.shift_type === 'folga' || row.shift_type === 'urlaub' || row.shift_type === 'krank') continue
    if (!rosterByDate.has(row.work_date)) rosterByDate.set(row.work_date, [])
    rosterByDate.get(row.work_date)!.push({ profileId: row.profile_id, shift: row.shift_type })
  }

  // 5. Buchungen (divers pro Tag + Session)
  const { data: bookingRows } = await db
    .from('booking_sessions')
    .select('session_date,session,seats')
    .gte('session_date', dateFrom)
    .lte('session_date', dateTo)
    .eq('status', 'booked')
    .in('is_test', sandbox ? [true, false] : [false])

  const diversByKey = new Map<string, number>()
  for (const b of bookingRows ?? []) {
    const key = `${b.session_date}_${b.session}`
    diversByKey.set(key, (diversByKey.get(key) ?? 0) + (b.seats ?? 1))
  }

  // 6. Skippers und Guides identifizieren
  const skippers = allProfiles.filter(p => p.is_skipper)
  const guides = allProfiles.filter(p => {
    const level = p.qualifications?.ssi_level ?? p.dive_role ?? ''
    return (LEVEL_RANK[level] ?? 0) >= MIN_GUIDE_LEVEL
  })

  // 7. Draft pro Tag berechnen
  const draft: Record<string, ScheduleEntry[]> = {}
  const summary: { date: string; session: string; divers: number; crew: string[] }[] = []

  // Skipper-Rotation: gleichmäßig verteilen über die Woche
  let skipperRotation = 0

  for (const { date, idx } of weekDays) {
    const working = rosterByDate.get(date) ?? []
    // Wer arbeitet heute (alle mit shift am, full)
    const workingAm = new Set(working.filter(w => w.shift === 'am' || w.shift === 'full').map(w => w.profileId))
    const workingPm = new Set(working.filter(w => w.shift === 'pm' || w.shift === 'full').map(w => w.profileId))

    for (const session of ['am', 'pm'] as const) {
      const cellKey = `${week_monday}_d${idx}_${session}`
      const workingSet = session === 'am' ? workingAm : workingPm
      const timeStart = session === 'am' ? amStart : pmStart
      const timeEnd   = session === 'am' ? amEnd   : pmEnd

      // Wenn niemand im Roster für diese Session → leere Zelle (kein Draft)
      if (workingSet.size === 0) {
        draft[cellKey] = []
        continue
      }

      const divers = diversByKey.get(`${date}_${session}`) ?? 0
      const guidesNeeded = divers > 0 ? Math.ceil(divers / RATIO) : 2 // Minimum 2 Guides auch ohne Buchungen

      const entries: ScheduleEntry[] = []

      // Skipper 1 (fährt, taucht nicht)
      const availableSkippers = skippers.filter(s => workingSet.has(s.id))
      if (availableSkippers.length >= 1) {
        const sk1 = availableSkippers[skipperRotation % availableSkippers.length]
        entries.push({ name: sk1.name, role: 'Skipper', start: timeStart, end: timeEnd })

        // Skipper 2 (taucht, Backup-Fahrer) — anderer als Skipper 1
        const sk2candidates = availableSkippers.filter(s => s.id !== sk1.id)
        if (sk2candidates.length >= 1) {
          const sk2 = sk2candidates[skipperRotation % sk2candidates.length]
          entries.push({ name: sk2.name, role: 'Guide', start: timeStart, end: timeEnd })
          // Sk2 zählt als 1 Guide → extra guides = guidesNeeded - 1
          const extraGuides = Math.max(0, guidesNeeded - 1)

          const availableGuides = guides.filter(g =>
            workingSet.has(g.id) &&
            g.id !== sk1.id &&
            g.id !== sk2.id
          )
          // Sortierung: höheres Level zuerst
          availableGuides.sort((a, b) => {
            const la = LEVEL_RANK[a.qualifications?.ssi_level ?? a.dive_role ?? ''] ?? 0
            const lb = LEVEL_RANK[b.qualifications?.ssi_level ?? b.dive_role ?? ''] ?? 0
            return lb - la
          })

          for (let g = 0; g < Math.min(extraGuides, availableGuides.length); g++) {
            entries.push({ name: availableGuides[g].name, role: 'Guide', start: timeStart, end: timeEnd })
          }
        }
        skipperRotation++
      } else {
        // Kein Skipper verfügbar — Warnung in entries
        entries.push({ name: '⚠ Kein Skipper verfügbar', role: 'Skipper', start: timeStart, end: timeEnd })
      }

      // Restliche arbeitende Personen → Folga (damit sie im Plan sichtbar sind)
      const assignedIds = new Set(
        entries
          .map(e => allProfiles.find(p => p.name === e.name)?.id)
          .filter(Boolean) as string[]
      )
      for (const profileId of workingSet) {
        if (!assignedIds.has(profileId)) {
          const p = allProfiles.find(x => x.id === profileId)
          if (p) entries.push({ name: p.name, role: 'Folga', start: timeStart, end: timeEnd })
        }
      }

      draft[cellKey] = entries
      summary.push({ date, session, divers, crew: entries.map(e => `${e.name} (${e.role})`) })
    }
  }

  // 8. Schreiben (wenn nicht dry_run)
  if (!dry_run) {
    const upserts = Object.entries(draft).map(([cell_key, entries]) => ({
      cell_key,
      entries,
      updated_at: new Date().toISOString(),
      is_test: sandbox,
    }))
    if (upserts.length > 0) {
      const { error } = await db.from('schedule_data').upsert(upserts, { onConflict: 'cell_key,is_test' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({
    week_monday,
    dry_run,
    cells_generated: Object.keys(draft).length,
    summary,
  })
}
