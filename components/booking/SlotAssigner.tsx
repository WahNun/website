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
 if (slots.length === 0) { setMsg(' Nothing changed — pick a slot, a start time or a new date'); return }
 setSaving(true); setMsg(null); setCapacityWarning(false)
 try {
 const res = await fetch('/api/bookings/assign-slots', { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ booking_id: bookingId, slots, ...(force ? { force: true } : {}) }) })
 const r = await res.json().catch(() => ({}))
 if (!res.ok || !r.ok) { setMsg(`${r.capacity_warning ? '' : ''} ${r.error ?? `HTTP ${res.status}`}`); setCapacityWarning(Boolean(r.capacity_warning)); setSaving(false); return }
 const mailNote = r.mail === 'sent' ? ' · guest emailed' : r.mail === 'error' ? ` · email failed: ${r.mail_error}` : ''
 const done = r.remaining === 0 ? ` All time slots set — instructor ticket resolved${mailNote}` : ` ${(r.set as string[]).join(' · ')} — ${r.remaining} day(s) still open${mailNote}`
 await load()
 setMsg(done)
 onChanged?.(done)
 } catch (e) { setMsg(` ${e instanceof Error ? e.message : String(e)}`) }
 setSaving(false)
 }

 const open = rows.filter(x => x.session === 'tbd').length
 const fieldBg = 'var(--bg)'
 return (
 <div style={{ marginBottom: '14px', padding: '14px', borderRadius: 'var(--radius-card)', border: '1px solid var(--line)', background: 'transparent' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text)', marginBottom: '6px' }}> Set time slots (same as instructor ticket)</div>
 {loading && <div style={{ fontSize: '14px', color: s.muted }}>Loading sessions…</div>}
 {error && <div style={{ fontSize: '14px', color: 'var(--text)' }}> {error}</div>}
 {!loading && !error && open === 0 && <div style={{ fontSize: '14px', color: 'var(--text)' }}> No open days — every session has a time slot.</div>}
 {rows.map(x => {
 const curPick = picks[x.id] ?? (x.session === 'tbd' ? undefined : (x.session as 'am' | 'pm'))
 const dateVal = dates[x.id] ?? x.session_date
 const timeVal = times[x.id] ?? (x.start_time ? x.start_time.slice(0, 5) : '')
 const boatVal = boat[x.id] ?? Boolean(x.is_boat_day)
 const dirty = Boolean(picks[x.id] && picks[x.id] !== x.session) || (times[x.id] !== undefined && times[x.id] !== (x.start_time ? x.start_time.slice(0, 5) : '')) || (Boolean(dates[x.id]) && dates[x.id] !== x.session_date) || (boat[x.id] !== undefined && boat[x.id] !== Boolean(x.is_boat_day))
 return (
 <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', flexWrap: 'wrap' }}>
 <input type="date" value={dateVal} min={new Date().toISOString().slice(0, 10)} title="Move this day" onChange={e => setDates(p => ({ ...p, [x.id]: e.target.value }))}
 style={{ background: fieldBg, border: `1px solid ${dateVal !== x.session_date ? 'var(--line)' : 'rgba(255,255,255,.12)'}`, borderRadius: 'var(--radius-control)', padding: '4px 8px', fontSize: '14px', color: s.text, fontFamily: s.font, outline: 'none', colorScheme: 'dark' }} />
 <span style={{ fontSize: '14px', color: x.session === 'tbd' ? 'var(--text)' : s.muted, minWidth: '70px' }}>{x.session === 'tbd' ? 'open' : `set: ${x.session.toUpperCase()}`}{x.notes ? ` · ${x.notes}` : ''}</span>
 {x.session !== 'night' && ([[true, ' Boat'], [false, ' Pool']] as const).map(([bv, bl]) => (
 <button key={bl} type="button" title="Boat seat or pool/harbour day" onClick={() => setBoat(p => ({ ...p, [x.id]: bv }))}
 style={{ padding: '5px 10px', borderRadius: 'var(--radius-control)', border: `1px solid ${boatVal === bv ? 'var(--line)' : 'rgba(255,255,255,.12)'}`, background: boatVal === bv ? 'transparent' : 'transparent', color: boatVal === bv ? 'var(--text)' : s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>
 {bl}
 </button>
 ))}
 {([['am', 'AM'], ['pm', 'PM'], ['full', 'Full day']] as const).map(([tt, label]) => {
 const on = curPick === tt
 return (
 <button key={tt} type="button" title={tt === 'full' ? 'Course takes the whole day — AM and PM session' : undefined} onClick={() => setPicks(p => ({ ...p, [x.id]: tt }))}
 style={{ padding: '5px 14px', borderRadius: 'var(--radius-control)', border: `1px solid ${on ? 'color-mix(in srgb, var(--text) 50%, transparent)' : 'rgba(255,255,255,.12)'}`, background: on ? 'color-mix(in srgb, var(--text) 16%, transparent)' : 'transparent', color: on ? s.accent : s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>
 {label}
 </button>
 )
 })}
 <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: s.muted }}>Start
 <input type="time" value={timeVal} onChange={e => setTimes(p => ({ ...p, [x.id]: e.target.value }))} title="Optional start time"
 style={{ background: fieldBg, border: '1px solid rgba(255,255,255,.12)', borderRadius: 'var(--radius-control)', padding: '4px 8px', fontSize: '14px', color: s.text, fontFamily: s.font, outline: 'none', colorScheme: 'dark' }} />
 </label>
 {dirty && <span style={{ fontSize: '14px', color: 'var(--text)' }}> changed</span>}
 </div>
 )
 })}
 {rows.length > 0 && (
 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
 <button type="button" disabled={saving} onClick={() => void save()}
 style={{ padding: '7px 16px', borderRadius: 'var(--radius-control)', border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, opacity: saving ? .6 : 1 }}>
 {saving ? 'Saving…' : 'Save changes & email guest'}
 </button>
 <span style={{ fontSize: '14px', color: s.muted }}>Every save emails the guest the full schedule (open days as “to be confirmed”). The instructor ticket resolves automatically once every day has a slot.</span>
 </div>
 )}
 {msg && <div style={{ fontSize: '14px', marginTop: '8px', color: msg.startsWith('') ? 'var(--text)' : msg.startsWith('') ? 'var(--text)' : 'var(--text)' }}>{msg}</div>}
 {capacityWarning && !saving && (
 <button type="button" onClick={() => void save(true)}
 style={{ marginTop: '6px', padding: '6px 14px', borderRadius: 'var(--radius-control)', border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>
 Save anyway (overbook — staff decision)
 </button>
 )}
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '8px' }}>Boat = takes a boat seat (capacity check). Pool = pool/harbour day, no seat.</div>
 </div>
 )
}
