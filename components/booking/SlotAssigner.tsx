'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { supabase, s } from '@/components/pages/_shared'

/**
 * Zeitfenster-Planung einer Buchung (Datum verschieben, Boot/Pool, AM/PM/Full day, Startzeit) —
 * gleiche Funktion und gleicher Endpunkt (/api/bookings/assign-slots) wie im Instructor-Ticket.
 * Der Endpunkt mailt den Gast bei jedem Speichern und erledigt das Ticket `booking:<id>`, sobald kein Tag mehr offen ist.
 */
type SlotRow = { id: string; session_date: string; session: string; notes: string | null; is_boat_day: boolean | null; start_time?: string | null }

export default function SlotAssigner({ bookingId, onChanged }: { bookingId: string; onChanged?: (message?: string) => void }) {
  const [rows, setRows] = useState<SlotRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [picks, setPicks] = useState<Record<string, 'am' | 'pm' | 'full'>>({})
  const [times, setTimes] = useState<Record<string, string>>({})
  const [dates, setDates] = useState<Record<string, string>>({})
  const [boat, setBoat] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [capacityWarning, setCapacityWarning] = useState(false)

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    return token ? { authorization: `Bearer ${token}` } : {}
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/bookings/assign-slots?booking_id=${bookingId}`, { headers: await authHeaders() })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) { setError(d.error ?? `HTTP ${res.status}`); setRows([]) } else setRows(d.sessions as SlotRow[])
      setPicks({}); setTimes({}); setDates({}); setBoat({})
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }, [bookingId, authHeaders])

  useEffect(() => { void load() }, [load])

  async function save(force = false) {
    const slots = rows.flatMap(x => {
      const cur = x.start_time ? x.start_time.slice(0, 5) : ''
      const o: { session_id: string; session?: string; start_time?: string; new_date?: string; is_boat_day?: boolean } = { session_id: x.id }
      if (picks[x.id] && picks[x.id] !== x.session) o.session = picks[x.id]
      if (times[x.id] !== undefined && times[x.id] !== cur) o.start_time = times[x.id]
      if (dates[x.id] && dates[x.id] !== x.session_date) o.new_date = dates[x.id]
      if (boat[x.id] !== undefined && boat[x.id] !== Boolean(x.is_boat_day)) o.is_boat_day = boat[x.id]
      return Object.keys(o).length > 1 ? [o] : []
    })
    if (slots.length === 0) { setMsg('❌ Nothing changed — pick a slot, a start time or a new date'); return }
    setSaving(true); setMsg(null); setCapacityWarning(false)
    try {
      const res = await fetch('/api/bookings/assign-slots', { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ booking_id: bookingId, slots, ...(force ? { force: true } : {}) }) })
      const r = await res.json().catch(() => ({}))
      if (!res.ok || !r.ok) { setMsg(`${r.capacity_warning ? '⚠️' : '❌'} ${r.error ?? `HTTP ${res.status}`}`); setCapacityWarning(Boolean(r.capacity_warning)); setSaving(false); return }
      const mailNote = r.mail === 'sent' ? ' · guest emailed' : r.mail === 'error' ? ` · email failed: ${r.mail_error}` : ''
      const done = r.remaining === 0 ? `✅ All time slots set — instructor ticket resolved${mailNote}` : `✅ ${(r.set as string[]).join(' · ')} — ${r.remaining} day(s) still open${mailNote}`
      await load()
      setMsg(done)
      onChanged?.(done)
    } catch (e) { setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`) }
    setSaving(false)
  }

  const open = rows.filter(x => x.session === 'tbd').length
  const fieldBg = '#030d1c'
  return (
    <div style={{ marginBottom: '14px', padding: '14px', borderRadius: '10px', border: '1px solid rgba(255,208,128,.3)', background: 'rgba(255,208,128,.06)' }}>
      <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#ffd080', marginBottom: '6px' }}>⏱ Set time slots (same as instructor ticket)</div>
      {loading && <div style={{ fontSize: '12px', color: s.muted }}>Loading sessions…</div>}
      {error && <div style={{ fontSize: '12px', color: '#ff6464' }}>❌ {error}</div>}
      {!loading && !error && open === 0 && <div style={{ fontSize: '12px', color: '#4ade80' }}>✅ No open days — every session has a time slot.</div>}
      {rows.map(x => {
        const curPick = picks[x.id] ?? (x.session === 'tbd' ? undefined : (x.session as 'am' | 'pm'))
        const dateVal = dates[x.id] ?? x.session_date
        const timeVal = times[x.id] ?? (x.start_time ? x.start_time.slice(0, 5) : '')
        const boatVal = boat[x.id] ?? Boolean(x.is_boat_day)
        const dirty = Boolean(picks[x.id] && picks[x.id] !== x.session) || (times[x.id] !== undefined && times[x.id] !== (x.start_time ? x.start_time.slice(0, 5) : '')) || (Boolean(dates[x.id]) && dates[x.id] !== x.session_date) || (boat[x.id] !== undefined && boat[x.id] !== Boolean(x.is_boat_day))
        return (
          <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', flexWrap: 'wrap' }}>
            <input type="date" value={dateVal} min={new Date().toISOString().slice(0, 10)} title="Move this day" onChange={e => setDates(p => ({ ...p, [x.id]: e.target.value }))}
              style={{ background: fieldBg, border: `1px solid ${dateVal !== x.session_date ? 'rgba(255,208,128,.6)' : 'rgba(255,255,255,.12)'}`, borderRadius: '6px', padding: '4px 8px', fontSize: '12.5px', color: s.text, fontFamily: s.font, outline: 'none', colorScheme: 'dark' }} />
            <span style={{ fontSize: '12px', color: x.session === 'tbd' ? '#ffd080' : s.muted, minWidth: '70px' }}>{x.session === 'tbd' ? 'open' : `set: ${x.session.toUpperCase()}`}{x.notes ? ` · ${x.notes}` : ''}</span>
            {x.session !== 'night' && ([[true, '🚤 Boat'], [false, '🏊 Pool']] as const).map(([bv, bl]) => (
              <button key={bl} type="button" title="Boat seat or pool/harbour day" onClick={() => setBoat(p => ({ ...p, [x.id]: bv }))}
                style={{ padding: '5px 10px', borderRadius: '7px', border: `1px solid ${boatVal === bv ? 'rgba(255,208,128,.55)' : 'rgba(255,255,255,.12)'}`, background: boatVal === bv ? 'rgba(255,208,128,.14)' : 'transparent', color: boatVal === bv ? '#ffd080' : s.muted, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: s.font }}>
                {bl}
              </button>
            ))}
            {([['am', 'AM'], ['pm', 'PM'], ['full', 'Full day']] as const).map(([tt, label]) => {
              const on = curPick === tt
              return (
                <button key={tt} type="button" title={tt === 'full' ? 'Course takes the whole day — AM and PM session' : undefined} onClick={() => setPicks(p => ({ ...p, [x.id]: tt }))}
                  style={{ padding: '5px 14px', borderRadius: '7px', border: `1px solid ${on ? 'rgba(243,239,230,.5)' : 'rgba(255,255,255,.12)'}`, background: on ? 'rgba(243,239,230,.16)' : 'transparent', color: on ? s.accent : s.muted, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: s.font }}>
                  {label}
                </button>
              )
            })}
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: s.muted }}>Start
              <input type="time" value={timeVal} onChange={e => setTimes(p => ({ ...p, [x.id]: e.target.value }))} title="Optional start time"
                style={{ background: fieldBg, border: '1px solid rgba(255,255,255,.12)', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', color: s.text, fontFamily: s.font, outline: 'none', colorScheme: 'dark' }} />
            </label>
            {dirty && <span style={{ fontSize: '11px', color: '#ffd080' }}>● changed</span>}
          </div>
        )
      })}
      {rows.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
          <button type="button" disabled={saving} onClick={() => void save()}
            style={{ padding: '7px 16px', borderRadius: '8px', border: '1px solid rgba(74,222,128,.4)', background: 'rgba(74,222,128,.12)', color: '#4ade80', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: s.font, opacity: saving ? .6 : 1 }}>
            {saving ? 'Saving…' : 'Save changes & email guest'}
          </button>
          <span style={{ fontSize: '11px', color: s.muted }}>Every save emails the guest the full schedule (open days as “to be confirmed”). The instructor ticket resolves automatically once every day has a slot.</span>
        </div>
      )}
      {msg && <div style={{ fontSize: '12px', marginTop: '8px', color: msg.startsWith('❌') ? '#ff6464' : msg.startsWith('⚠️') ? '#ffd080' : '#4ade80' }}>{msg}</div>}
      {capacityWarning && !saving && (
        <button type="button" onClick={() => void save(true)}
          style={{ marginTop: '6px', padding: '6px 14px', borderRadius: '8px', border: '1px solid rgba(255,208,128,.5)', background: 'rgba(255,208,128,.12)', color: '#ffd080', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: s.font }}>
          ⚠️ Save anyway (overbook — staff decision)
        </button>
      )}
      <div style={{ fontSize: '11px', color: s.muted, marginTop: '8px' }}>Boat = takes a boat seat (capacity check). Pool = pool/harbour day, no seat.</div>
    </div>
  )
}
