'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type ShiftType = 'am' | 'pm' | 'full' | 'folga' | 'urlaub' | 'krank' | null

const SHIFT_COLORS: Record<string, string> = {
  am:     '#bcd4ea', // hellblau — Morgenschicht
  pm:     '#d4eabc', // hellgrün — Abendschicht
  full:   '#7ab8e8', // blau — Ganztag
  folga:  '#f5c59a', // orange — Folga
  urlaub: '#f5c59a', // orange — Urlaub
  krank:  '#e87a7a', // rot — Krank
}
const SHIFT_LABEL: Record<string, string> = {
  am:     '8–13h',
  pm:     '11–20h',
  full:   'Ganztag',
  folga:  'Folga',
  urlaub: 'Urlaub',
  krank:  'Krank',
}

// Reihenfolge beim Durchklicken
const SHIFT_CYCLE: ShiftType[] = ['am', 'pm', 'full', 'folga', 'urlaub', 'krank', null]

type Profile = { id: string; name: string }

type RosterCell = { shift_type: ShiftType }

export function MonthlyRosterGrid({ year, month, company = 'azd' }: {
  year: number
  month: number   // 1-12
  company?: string
}) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [roster, setRoster] = useState<Record<string, ShiftType>>({})  // `${profile_id}_${date}` → shift
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [drafting, setDrafting] = useState(false)
  const [draftResult, setDraftResult] = useState<string | null>(null)

  // Tage des Monats
  const daysInMonth = new Date(year, month, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  function dateStr(day: number): string {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  function cellKey(profileId: string, day: number) {
    return `${profileId}_${dateStr(day)}`
  }

  // Daten laden
  useEffect(() => {
    supabase.from('profiles')
      .select('id,name')
      .eq('company', company)
      .neq('dive_role', 'other')
      .order('name')
      .then(({ data }) => setProfiles(data ?? []))
  }, [company])

  useEffect(() => {
    if (profiles.length === 0) return
    const from = dateStr(1)
    const to = dateStr(daysInMonth)
    supabase.from('monthly_roster')
      .select('profile_id,work_date,shift_type')
      .in('profile_id', profiles.map(p => p.id))
      .gte('work_date', from)
      .lte('work_date', to)
      .then(({ data }) => {
        const map: Record<string, ShiftType> = {}
        for (const row of data ?? []) {
          const day = parseInt(row.work_date.slice(8, 10), 10)
          map[cellKey(row.profile_id, day)] = row.shift_type as ShiftType
        }
        setRoster(map)
      })
  }, [profiles, year, month])

  const toggleCell = useCallback(async (profileId: string, day: number) => {
    const key = cellKey(profileId, day)
    const current = roster[key] ?? null
    const idx = SHIFT_CYCLE.indexOf(current)
    const next = SHIFT_CYCLE[(idx + 1) % SHIFT_CYCLE.length]

    setRoster(prev => ({ ...prev, [key]: next }))
    setSaving(prev => new Set(prev).add(key))

    const date = dateStr(day)
    if (next === null) {
      await supabase.from('monthly_roster')
        .delete()
        .eq('profile_id', profileId)
        .eq('work_date', date)
    } else {
      const startTime = next === 'pm' ? '11:00' : '08:00'
      const endTime   = next === 'pm' ? '20:00' : '13:00'
      await supabase.from('monthly_roster')
        .upsert({
          profile_id: profileId,
          work_date: date,
          shift_type: next,
          start_time: startTime,
          end_time: endTime,
        }, { onConflict: 'profile_id,work_date' })
    }

    setSaving(prev => { const s = new Set(prev); s.delete(key); return s })
  }, [roster, year, month])

  // Draft generieren für alle Wochen des Monats
  async function generateDraft() {
    setDrafting(true)
    setDraftResult(null)

    // Alle Montage des Monats finden
    const mondays: string[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d)
      if (date.getDay() === 1) mondays.push(dateStr(d))
    }

    let totalCells = 0
    const errors: string[] = []

    for (const monday of mondays) {
      const res = await fetch('/api/schedule/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ''}` },
        body: JSON.stringify({ week_monday: monday, dry_run: false }),
      })
      const json = await res.json()
      if (res.ok) totalCells += json.cells_generated ?? 0
      else errors.push(`Woche ${monday}: ${json.error ?? 'Fehler'}`)
    }

    if (errors.length > 0) {
      setDraftResult(`⚠ ${errors.join(', ')}`)
    } else {
      setDraftResult(`✓ Draft generiert — ${totalCells} Zellen. Anpassbar im Schedule-Tab.`)
    }
    setDrafting(false)
  }

  const MONTH_NAMES = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']

  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
          Monatsplan — {MONTH_NAMES[month - 1]} {year}
        </h3>
        <button
          onClick={generateDraft}
          disabled={drafting}
          style={{
            background: drafting ? '#555' : '#4fe3c8',
            color: '#000',
            border: 'none',
            borderRadius: 6,
            padding: '5px 14px',
            fontWeight: 600,
            cursor: drafting ? 'not-allowed' : 'pointer',
            fontSize: 12,
          }}
        >
          {drafting ? '…generiert' : '⚡ Draft generieren'}
        </button>
        {draftResult && (
          <span style={{ color: draftResult.startsWith('⚠') ? '#f87171' : '#4fe3c8', fontSize: 11 }}>
            {draftResult}
          </span>
        )}
      </div>

      {/* Legende */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        {Object.entries(SHIFT_COLORS).map(([k, col]) => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 14, height: 14, background: col, display: 'inline-block', borderRadius: 3 }} />
            <span style={{ color: '#aaa' }}>{SHIFT_LABEL[k]}</span>
          </span>
        ))}
        <span style={{ color: '#666', marginLeft: 8 }}>Klick = Schicht wechseln</span>
      </div>

      {/* Grid */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ width: 90, textAlign: 'left', padding: '4px 8px', color: '#888', fontWeight: 500 }}>
                Personal
              </th>
              {days.map(d => {
                const date = new Date(year, month - 1, d)
                const dow = date.getDay()
                const isWeekend = dow === 0 || dow === 6
                return (
                  <th
                    key={d}
                    style={{
                      width: 28,
                      textAlign: 'center',
                      padding: '4px 2px',
                      color: isWeekend ? '#f87171' : '#888',
                      fontWeight: isWeekend ? 700 : 400,
                      fontSize: 11,
                    }}
                  >
                    {d}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {profiles.map(p => (
              <tr key={p.id}>
                <td style={{ padding: '2px 8px', color: '#ccc', whiteSpace: 'nowrap', fontSize: 12 }}>
                  {p.name}
                </td>
                {days.map(d => {
                  const key = cellKey(p.id, d)
                  const shift = roster[key] ?? null
                  const isSaving = saving.has(key)
                  return (
                    <td
                      key={d}
                      onClick={() => toggleCell(p.id, d)}
                      title={shift ? SHIFT_LABEL[shift] : 'frei'}
                      style={{
                        width: 28,
                        height: 22,
                        background: shift ? SHIFT_COLORS[shift] : 'transparent',
                        border: '1px solid #2a2a2a',
                        cursor: 'pointer',
                        textAlign: 'center',
                        fontSize: 9,
                        color: '#000',
                        opacity: isSaving ? 0.5 : 1,
                        transition: 'background 0.1s',
                        userSelect: 'none',
                      }}
                    >
                      {shift && !isSaving ? SHIFT_LABEL[shift].replace('h','') : ''}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
