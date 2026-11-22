'use client'

import { isSandboxBooking } from '@/lib/sandboxClient'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { s } from '@/components/pages/_shared'

/**
 * Calendar for picking dive days.
 *
 * A dive pack covers several boat sessions, and the guest picks AM or PM for
 * each day. The calendar shows what is actually possible: seats left per
 * session, days past the booking cutoff, days with no boat. None of it is
 * trusted — the server checks all of it again at checkout.
 *
 * staffMode=true: disables all capacity/bookable blocking. Staff can pick any
 * date and session regardless of cutoff, boat status or capacity. Shows
 * "booked/total" instead of "seats left" as a soft indicator only.
 */

export type SessionKey = 'am' | 'pm' | 'night'
export type Availability = {
 date: string; session: SessionKey
 capacity: number; booked: number; seats_left: number
 bookable: boolean; reason: null | 'past_cutoff' | 'no_boat' | 'full'
 crew_missing: boolean
 max_party: number
 departure_time: string | null; eta: string | null
}
export type Picked = { date: string; session: SessionKey | 'tbd' }

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
 'July', 'August', 'September', 'October', 'November', 'December']

function ymd(d: Date) {
 return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Verfügbarkeit je Monat, damit das Raster nicht bei jedem Öffnen neu lädt (immer im Hintergrund aufgefrischt)
const AVAIL_CACHE = new Map<string, { sessions: Availability[]; today: string }>()

export default function SessionPicker({
 required, seats, picked, onChange, showCrewWarning = false, onCapacityChange, staffMode = false, allowTbd = false, notBefore, mode = 'boat', blockedSlots, freePick = false, initialMonth, slotHint, dayHint, pickedExtra,
}: {
 required: number
 /** Startmonat des Kalenders (YYYY-MM-DD); Default: aktueller Monat — Request-Planner startet bei den angefragten Tagen */
 initialMonth?: string
 /** Hinweis je Slot (Request-Planner: Fairness-Score) — title ergänzt den Tooltip */
 slotHint?: (date: string, session: SessionKey) => { color: string; title: string } | null
 /** Tönung der ganzen Tageskachel (Request-Planner: beste Fairness des Tages), dezent; null = neutral */
 dayHint?: (date: string) => { color: string; ring?: boolean } | null
 /** Zusatztext am Chip eines gewählten Slots (Request-Planner: Taucher + Umsatz), z. B. "5 divers · €495" */
 pickedExtra?: (p: Picked) => string | null
 /** Beliebig viele Tage wählbar (Request-Planner): kein Deckel, kein Umsortieren, Zähler statt „n more days" */
 freePick?: boolean
 /**
 * 'boat' (Standard): AM/PM je Tag. 'night': Night Dive — nur Datum wählen, Session ist fest 'night',
 * kein AM/PM-Toggle; blockiert keine Tages-Session. Nur das Produkt night-dive setzt 'night'.
 */
 mode?: 'boat' | 'night'
 seats: number
 picked: Picked[]
 onChange: (next: Picked[]) => void
 showCrewWarning?: boolean
 /** Kleinste Restkapazität über alle gewählten Tage — begrenzt die Gästezahl oben. */
 onCapacityChange?: (maxSeats: number | null) => void
 /**
 * Staff mode: disables capacity blocking. Any date/session is selectable.
 * Shows booked/capacity as a soft indicator only (no hard block).
 */
 staffMode?: boolean
 /**
 * Staff-Option „Instructor decides": pro Tag zusätzlich TBD wählbar (Kurse) — Session wird ohne
 * Zeitfenster angelegt, Instructor setzt AM/PM später im Sessions-Tab (Ticket entsteht).
 */
 allowTbd?: boolean
 /** Tage bis einschließlich dieses Datums sind gesperrt (z. B. Tauchtage erst nach dem Refresher) */
 notBefore?: string
 /** Gibt einen Grund zurück, wenn dieser Slot für diese Person nicht wählbar ist (z. B. Tageslimit Tauchgänge) */
 blockedSlots?: (date: string, session: SessionKey) => string | null
}) {
 const [avail, setAvail] = useState<Availability[] | null>(null)
 const [today, setToday] = useState<string | null>(null)
 const [cursor, setCursor] = useState(() => {
 // Gäste: frühestens morgen buchbar (Buchungsschluss am Vortag) Start im Monat des ersten möglichen Tags bzw. der ersten Wahl,
 // sonst öffnet am Monatsende ein Monat ohne wählbaren Tag. Staff (FO) startet weiter im aktuellen Monat (Buchung am selben Tag).
 const tomorrow = ymd(new Date(Date.now() + 86400000))
 const guestStart = picked[0]?.date ?? (notBefore && notBefore >= tomorrow ? notBefore : tomorrow)
 const startIso = initialMonth && /^\d{4}-\d{2}-\d{2}$/.test(initialMonth) ? initialMonth : staffMode ? null : guestStart
 const base = startIso ? new Date(startIso + 'T12:00:00') : new Date()
 const d = isNaN(base.getTime()) ? new Date() : base
 d.setDate(1); return d
 })
 const [loading, setLoading] = useState(true)
 // Für welchen Monat `avail` gerade gilt (beim Monatswechsel ohne Cache steht kurz noch der alte Monat drin)
 const [loadedRange, setLoadedRange] = useState<string | null>(null)
 const [detailDate, setDetailDate] = useState<string | null>(null)
 // Schmale Container (Handy): zwei Schritte — Tag antippen, dann Morning/Afternoon groß wählen und bestätigen.
 const rootRef = React.useRef<HTMLDivElement>(null)
 const [narrow, setNarrow] = useState(false)
 const [pendingSession, setPendingSession] = useState<SessionKey | 'tbd' | null>(null)
 // Handy-Gäste: flachere Tageszellen + Auswahl als Bottom Sheet. Staff (staffMode) behält das bisherige Layout.
 const compact = narrow && !staffMode
 useEffect(() => {
 const el = rootRef.current
 if (!el || typeof ResizeObserver === 'undefined') return
 const ro = new ResizeObserver(entries => { for (const e of entries) setNarrow(e.contentRect.width < 440) })
 ro.observe(el)
 return () => ro.disconnect()
 }, [])
 useEffect(() => { setPendingSession(null) }, [detailDate])
 useEffect(() => {
 if (!(detailDate && compact && mode !== 'night')) return
 const prevOverflow = document.body.style.overflow
 document.body.style.overflow = 'hidden'
 const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDetailDate(null) }
 window.addEventListener('keydown', onKey)
 return () => { document.body.style.overflow = prevOverflow; window.removeEventListener('keydown', onKey) }
 }, [detailDate, compact, mode])

 const from = ymd(new Date(cursor.getFullYear(), cursor.getMonth(), 1))
 const to = ymd(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0))

 useEffect(() => {
 // Schon geladener Monat (oder vorgeladener Folgemonat): sofort zeigen, im Hintergrund auffrischen — Kreis nur, wenn wirklich geladen werden muss
 const sb = isSandboxBooking() ? '&sandbox=1' : ''
 const key = `${from}_${to}${sb}`
 const hit = AVAIL_CACHE.get(key)
 let cancelled = false
 if (hit) {
 // eslint-disable-next-line react-hooks/set-state-in-effect -- Cache-Treffer, kein Fetch nötig
 setAvail(hit.sessions); setToday(hit.today); setLoadedRange(`${from}_${to}`); setLoading(false)
 } else {
 setLoading(true)
 }
 fetch(`/api/availability?from=${from}&to=${to}${sb}`)
 .then(r => r.json())
 .then(d => {
 if (!d.sessions) return
 AVAIL_CACHE.set(key, { sessions: d.sessions, today: d.today })
 if (!cancelled) { setAvail(d.sessions); setToday(d.today); setLoadedRange(`${from}_${to}`) }
 // Folgemonat vorladen, damit › ohne Wartezeit klappt
 const nf = ymd(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
 const nt = ymd(new Date(cursor.getFullYear(), cursor.getMonth() + 2, 0))
 const nkey = `${nf}_${nt}${sb}`
 if (!AVAIL_CACHE.has(nkey)) {
 fetch(`/api/availability?from=${nf}&to=${nt}${sb}`).then(r => r.json()).then(n => { if (n.sessions) AVAIL_CACHE.set(nkey, { sessions: n.sessions, today: n.today }) }).catch(() => {})
 }
 })
 .catch(() => {})
 .finally(() => { if (!cancelled) setLoading(false) })
 return () => { cancelled = true }
 }, [from, to])

 const byKey = useMemo(() => {
 const m = new Map<string, Availability>()
 for (const a of avail ?? []) m.set(`${a.date}_${a.session}`, a)
 return m
 }, [avail])

 const pickedKeys = useMemo(() => new Set(picked.map(p => `${p.date}_${p.session}`)), [picked])

 // Abfahrtszeiten kommen aus boat_status, nicht aus einer Konstante im Code.
 // Steht für den Zeitraum nichts, bleibt die Zeitangabe weg statt zu raten.
 const [amTimes, pmTimes] = useMemo(() => {
 const pick = (sess: SessionKey) => {
 const row = (avail ?? []).find(a => a.session === sess && a.departure_time)
 if (!row?.departure_time) return null
 return row.eta ? `${row.departure_time} – ${row.eta}` : `from ${row.departure_time}`
 }
 return [pick('am'), pick('pm')]
 }, [avail])

 const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
 const lead = (firstDay.getDay() + 6) % 7
 const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
 const cells: (string | null)[] = [
 ...Array(lead).fill(null),
 ...Array.from({ length: daysInMonth }, (_, i) => ymd(new Date(cursor.getFullYear(), cursor.getMonth(), i + 1))),
 ]

 // Vergangene Wochen am Anfang des Monats ausblenden: der erste wählbare Tag steht in der obersten Zeile
 const todayCut = today ?? new Date().toISOString().slice(0, 10)
 // Gäste: Kalender beginnt beim ersten wählbaren Tag (Lucas 31.10.) — heute ist nie online buchbar, und Wochen ohne
 // wählbaren Tag vor dem ersten freien Termin werden ausgeblendet. Gewählte Tage bleiben immer sichtbar.
 const monthReady = loadedRange === `${from}_${to}`
 const guestBookable = (date: string) => {
 if (date <= todayCut || (notBefore && date <= notBefore)) return false
 const keys: SessionKey[] = mode === 'night' ? ['night'] : ['am', 'pm']
 return keys.some(k => { const a = byKey.get(`${date}_${k}`); return Boolean(a?.bookable) && (a?.max_party ?? 0) >= seats && !blockedSlots?.(date, k) })
 }
 const firstBookable = !staffMode && monthReady ? (cells.find(d => d && guestBookable(d)) ?? null) : null
 const pickedDates = new Set(picked.map(p => p.date))
 const deadCell = (d: string | null) => !d || (!pickedDates.has(d) && ((staffMode ? d < todayCut : d <= todayCut) || (notBefore ? d <= notBefore : false) || (firstBookable ? d < firstBookable : false)))
 // Zurückblättern nur, solange der Vormonat noch wählbare Tage hat (Staff: immer)
 const prevMonthLast = ymd(new Date(cursor.getFullYear(), cursor.getMonth(), 0))
 const canPrev = staffMode || (prevMonthLast > todayCut && !(notBefore && prevMonthLast <= notBefore))
 let dropCells = 0
 while (dropCells + 7 <= cells.length && cells.slice(dropCells, dropCells + 7).every(deadCell) && cells.slice(dropCells, dropCells + 7).some(Boolean)) dropCells += 7
 const visibleCells = cells.slice(dropCells)

 // Beim Öffnen (Gast, nichts gewählt): Monat ohne wählbaren Tag automatisch weiter, höchstens 12 Monate.
 // Sobald der Gast selbst blättert, springt nichts mehr von allein.
 const autoNav = useRef(!staffMode && !initialMonth && !freePick)
 const autoNavSteps = useRef(0)
 useEffect(() => {
 if (!autoNav.current || !monthReady) return
 if (firstBookable || picked.length > 0 || autoNavSteps.current >= 12) { autoNav.current = false; return }
 autoNavSteps.current++
 // Sprung erst nach geladener Verfügbarkeit möglich
 setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))
 }, [monthReady, firstBookable, picked.length])

 // Zuletzt gewählte Session — bei voller Auswahl wird genau diese verschoben (Klick auf einen anderen Tag ersetzt sie)
 const lastPickKey = useRef<string | null>(null)
 // Welche Wahl würde ein Klick auf `date` ersetzen? null = es ist noch Platz (oder derselbe Tag tauscht nur die Hälfte)
 function replaceTargetFor(date: string): Picked | null {
 const withoutSameDay = picked.filter(p => p.date !== date)
 if (withoutSameDay.length < required) return null
 return withoutSameDay.find(p => `${p.date}_${p.session}` === lastPickKey.current) ?? withoutSameDay[withoutSameDay.length - 1] ?? null
 }

 function toggle(date: string, session: SessionKey | 'tbd') {
 const key = `${date}_${session}`
 if (pickedKeys.has(key)) {
 if (lastPickKey.current === key) lastPickKey.current = null
 onChange(picked.filter(p => `${p.date}_${p.session}` !== key))
 return
 }
 // One session per day — picking the other half swaps it
 const withoutSameDay = picked.filter(p => p.date !== date)
 // Auswahl voll: der Klick auf einen anderen Tag verschiebt die zuletzt gewählte Session komplett auf den neuen Tag
 const target = freePick ? null : replaceTargetFor(date)
 const kept = target ? withoutSameDay.filter(p => p !== target) : withoutSameDay
 lastPickKey.current = key
 onChange([...kept, { date, session }].sort((a, b) => a.date.localeCompare(b.date)))
 }

 const remaining = required - picked.length
 // Scales with group size; a future 'mode' prop can override it for staff/walk-in use.
 const tightThreshold = Math.max(seats * 2, 4)

 // Die Gästezahl kann nie höher sein als der engste gewählte Tag hergibt.
 // Ohne das lässt sich die Zahl nach der Tageswahl beliebig hochdrehen und der
 // Gast merkt erst beim Bezahlen, dass es nicht passt.
 const tightest = useMemo(() => {
 if (picked.length === 0 || !avail) return null
 let min = Infinity
 for (const p of picked) {
 const a = byKey.get(`${p.date}_${p.session}`)
 if (!a) continue
 min = Math.min(min, a.max_party) // was auf EIN Boot passt, begrenzt die Gruppe
 }
 return Number.isFinite(min) ? min : null
 }, [picked, byKey, avail])

 useEffect(() => {
 onCapacityChange?.(tightest)
 }, [tightest, onCapacityChange])

 return (
 <div ref={rootRef}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
 <button type="button" disabled={!canPrev} onClick={() => { autoNav.current = false; setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1)) }} style={{ ...navBtn, opacity: canPrev ? 1 : 0.3, cursor: canPrev ? 'pointer' : 'default' }}>‹</button>
 <div style={{ fontSize: '14px', fontWeight: 800, color: s.text, minWidth: narrow ? 0 : '148px', flex: narrow ? 1 : undefined, textAlign: 'center' }}>
 {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
 </div>
 <button type="button" onClick={() => { autoNav.current = false; setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1)) }} style={navBtn}>›</button>
 <div style={{ marginLeft: narrow ? 0 : 'auto', fontSize: '14px', fontWeight: 700, whiteSpace: 'nowrap', color: remaining === 0 ? '#b7c4b0' : s.accent }}>
 {freePick ? `${picked.length} day${picked.length === 1 ? '' : 's'} picked` : remaining === 0
 ? (narrow ? ' all picked' : ` ${required} day${required === 1 ? '' : 's'} selected`)
 : narrow ? `${remaining} to pick` : `${remaining} more day${remaining === 1 ? '' : 's'} to pick`}
 </div>
 </div>

 {/* Ohne diese Zeile raten Gäste, was AM und PM heissen sollen — auf dem Handy nur eine Zeile: erst Tag, Morning/Afternoon (mit Zeiten) folgt im Schritt 2 */}
 {narrow && mode !== 'night' ? (
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '10px', lineHeight: 1.5 }}>Tap a day first — then choose morning or afternoon.</div>
 ) : (
 <div style={{
 display: 'flex', gap: '18px', flexWrap: 'wrap', marginBottom: '14px',
 padding: '10px 14px', borderRadius: 0,
 background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)',
 }}>
 {(mode === 'night' ? [['NIGHT', 'Night Dive', 'evening · time confirmed by the team']] as const : [['AM', 'Morning', amTimes], ['PM', 'Afternoon', pmTimes]] as const).map(([tag, word, t]) => (
 <div key={tag} style={{ display: 'flex', alignItems: 'baseline', gap: '7px' }}>
 <span style={{
 fontSize: '14px', fontWeight: 800, padding: '2px 7px', borderRadius: 0,
 background: 'rgba(243,239,230,.14)', color: s.accent, border: '1px solid rgba(243,239,230,.3)',
 }}>{tag}</span>
 <span style={{ fontSize: '14px', color: s.sub, fontWeight: 600 }}>{word}</span>
 {t && <span style={{ fontSize: '14px', color: s.muted }}>{t}</span>}
 </div>
 ))}
 <div style={{ fontSize: '14px', color: s.muted, alignSelf: 'center' }}>{mode === 'night' ? 'Separate evening session — does not block AM or PM' : 'Two dives per session'}</div>
 </div>
 )}

 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '4px', marginBottom: '6px' }}>
 {WEEKDAYS.map(w => (
 <div key={w} style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: s.muted, textAlign: 'center', padding: '4px 0' }}>{w}</div>
 ))}
 </div>

 {/* Beim Laden kein ausgegrautes Raster (wirkt wie „nichts buchbar“), sondern ein Kreis */}
 {loading ? (
 <div role="status" aria-label="Loading availability" style={{ minHeight: '190px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
 <style>{'@keyframes azdSpin{to{transform:rotate(360deg)}}'}</style>
 <div style={{ width: '34px', height: '34px', borderRadius: '50%', border: '3px solid rgba(243,239,230,.18)', borderTopColor: s.accent, animation: 'azdSpin .8s linear infinite' }} />
 </div>
 ) : (
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '4px' }}>
 {visibleCells.map((date, i) => {
 if (!date) return <div key={`b${i}`} />
 const am = byKey.get(`${date}_am`)
 const pm = byKey.get(`${date}_pm`)
 const isPast = date < (today ?? new Date().toISOString().slice(0, 10)) || (notBefore ? date <= notBefore : false)
 // staffMode: Buttons zeigen (aber nicht für vergangene Daten); guest: nur wenn bookable
 const anyBookable = isPast ? false : (staffMode ? true : mode === 'night' ? Boolean(byKey.get(`${date}_night`)?.bookable) : Boolean(am?.bookable || pm?.bookable))
 const chosen = picked.find(p => p.date === date)
 const isToday = date === today
 // Night-Modus: die ganze Tageskarte schaltet die Night-Session um, nicht nur der Chip
 const nightA = mode === 'night' ? byKey.get(`${date}_night`) : undefined
 const nightCan = mode === 'night' && anyBookable && (isPast ? false : (staffMode ? true : Boolean(nightA?.bookable) && (nightA?.max_party ?? 0) >= seats))
 return (
 <div key={date} onClick={() => { if (mode !== 'night') setDetailDate(date); else if (nightCan) toggle(date, 'night') }} style={{
 borderRadius: 0, padding: '5px 4px 6px',
 background: chosen ? 'rgba(243,239,230,.14)' : (!isPast && anyBookable && dayHint?.(date)) ? `${dayHint(date)!.color}2e` : anyBookable ? 'rgba(255,255,255,.03)' : 'transparent',
 border: `1px solid ${chosen ? s.accent : (!isPast && anyBookable && dayHint?.(date)?.ring) ? dayHint(date)!.color : isToday ? 'rgba(255,255,255,.22)' : 'transparent'}`,
 boxShadow: !chosen && !isPast && anyBookable && dayHint?.(date)?.ring ? `0 0 0 1px ${dayHint(date)!.color}` : undefined,
 minHeight: compact ? '46px' : '62px', cursor: mode === 'night' && !nightCan ? 'default' : 'pointer',
 }}>
 <div style={{
 fontSize: '14px', fontWeight: chosen ? 800 : 600, textAlign: 'center', marginBottom: compact ? '1px' : '4px',
 color: !anyBookable ? 'rgba(255,255,255,.2)' : chosen ? s.accent : s.sub,
 }}>{Number(date.slice(8, 10))}</div>

 {anyBookable && mode === 'night' ? (() => {
 const a = byKey.get(`${date}_night`)
 const on = pickedKeys.has(`${date}_night`)
 const nightBlocked = !isPast && !on ? (blockedSlots?.(date, 'night') ?? null) : null
 const can = isPast || nightBlocked ? false : (staffMode ? true : Boolean(a?.bookable) && (a?.max_party ?? 0) >= seats)
 return (
 <button type="button" disabled={!can} onClick={e => { e.stopPropagation(); toggle(date, 'night') }}
 title={nightBlocked ?? (a ? `Night Dive: ${a.booked}/${a.capacity} booked` : 'Night Dive')}
 style={{
 width: '100%', padding: '3px 0', borderRadius: 0, fontSize: '14px', fontWeight: 800, fontFamily: s.font,
 cursor: can ? 'pointer' : 'default',
 background: on ? '#c9c2b6' : can ? 'rgba(243,239,230,0.12)' : 'transparent',
 color: on ? '#121210' : can ? '#f3efe6' : 'rgba(255,255,255,.13)',
 border: `1px solid ${on ? '#c9c2b6' : can ? 'rgba(243,239,230,0.35)' : 'transparent'}`,
 }}> NIGHT{staffMode && a && a.booked > 0 ? ` ${a.booked}/${a.capacity}` : ''}</button>
 )
 })() : anyBookable && narrow ? (
 <div style={{ display: 'flex', justifyContent: 'center', gap: '3px', minHeight: compact ? '12px' : '18px' }}>
 {chosen
 ? <span style={{ fontSize: '14px', fontWeight: 800, padding: '2px 6px', borderRadius: 0, background: s.accent, color: '#000' }}>
 {(picked.find(p => p.date === date)?.session ?? '').toUpperCase() || ''}
 </span>
 : <span style={{ fontSize: '14px', color: detailDate === date ? s.accent : 'rgba(255,255,255,.3)' }}>{detailDate === date ? '' : '•'}</span>}
 </div>
 ) : anyBookable ? (
 <div style={{ display: 'flex', gap: '3px' }}>
 {(['am', 'pm'] as SessionKey[]).map(sess => {
 const a = sess === 'am' ? am : pm
 const on = pickedKeys.has(`${date}_${sess}`)
 // staffMode: wählbar außer vergangene Daten; guest: nur wenn capacity passt
 const blockedReason = !isPast && !on ? (blockedSlots?.(date, sess) ?? null) : null
 const can = isPast || blockedReason ? false : (staffMode ? true : Boolean(a?.bookable) && (a?.max_party ?? 0) >= seats)
 // staffMode: orange wenn >50% belegt (soft warning), nicht blockend
 const staffBusy = staffMode && a && a.capacity > 0 && (a.booked / a.capacity) >= 0.6
 // staffMode: dieser Gast passt nicht mehr aufs Boot Buchung wäre ein Capacity-Override
 const staffOver = staffMode && !isPast && !!a && a.capacity > 0 && (a.booked + seats > a.capacity)
 const tight = !staffMode && can && (a?.max_party ?? 0) < tightThreshold
 const hint = can && slotHint ? slotHint(date, sess) : null
 // staffMode: Belegungsinfo im Tooltip
 const titleStaff = staffMode
 ? (a ? `${sess.toUpperCase()}: ${a.booked}/${a.capacity} booked${staffOver ? ` · ${Math.max(0, a.capacity - a.booked)} seat(s) left, you need ${seats} — capacity override` : ''}${a.departure_time ? ` · ${a.departure_time}` : ''}${!a.bookable ? ` · ${a.reason ?? 'restricted'}` : ''}` : `${sess.toUpperCase()}: no data yet`)
 : (!can
 ? (blockedReason ? blockedReason : a?.reason === 'full' ? 'Fully booked' : a?.reason === 'no_boat' ? 'No boat that session' : a?.reason === 'past_cutoff' ? 'Past the booking cutoff' : `Room for ${a?.max_party ?? 0} more on one boat — you need ${seats}`)
 : `${sess === 'am' ? 'Morning' : 'Afternoon'}${a?.departure_time ? ` · be there ${a.departure_time}${a.eta ? `, back ${a.eta}` : ''}` : ''} · ${a?.seats_left} of ${a?.capacity} seats left${showCrewWarning && a?.crew_missing ? ' · no crew rostered yet' : ''}`)
 return (
 <button key={sess} type="button" disabled={!can} onClick={() => toggle(date, sess)}
 title={hint ? `${hint.title}\n${titleStaff}` : titleStaff}
 style={{
 flex: 1, padding: '3px 0', borderRadius: 0, fontSize: '14px', fontWeight: 800,
 fontFamily: s.font, cursor: can ? 'pointer' : 'default',
 background: on ? (staffOver ? '#c9928c' : s.accent) : staffOver ? 'rgba(201,146,140,.14)' : can ? 'rgba(255,255,255,.06)' : 'transparent',
 color: on ? '#090909' : staffOver ? '#c9928c' : staffBusy ? '#d4a07a' : can ? (tight ? '#d4a07a' : s.muted) : 'rgba(255,255,255,.13)',
 border: `1px solid ${on ? (staffOver ? '#c9928c' : s.accent) : staffOver ? 'rgba(201,146,140,.55)' : can ? (staffBusy ? 'rgba(212,160,122,.35)' : 'rgba(255,255,255,.1)') : 'transparent'}`,
 }}>
 {sess.toUpperCase()}{staffOver ? ' !' : ''}{showCrewWarning && can && a?.crew_missing ? '·' : ''}
 </button>
 )
 })}
 {allowTbd && staffMode && !isPast && (() => {
 const on = pickedKeys.has(`${date}_tbd`)
 return (
 <button key="tbd" type="button" onClick={() => toggle(date, 'tbd')}
 title="Instructor decides the time — session is created without AM/PM, a ticket asks the instructor to set it"
 style={{
 flex: 1, padding: '3px 0', borderRadius: 0, fontSize: '14px', fontWeight: 800, fontFamily: s.font, cursor: 'pointer',
 background: on ? '#c9b48a' : 'rgba(201,180,138,.08)', color: on ? '#1a1200' : '#c9b48a',
 border: `1px solid ${on ? '#c9b48a' : 'rgba(201,180,138,.35)'}`,
 }}></button>
 )
 })()}
 </div>
 ) : (
 <div style={{ fontSize: '14px', textAlign: 'center', color: 'rgba(255,255,255,.15)' }}>—</div>
 )}

 {/* staffMode: booked/capacity als Zahl unter den Buttons */}
 {staffMode && anyBookable && mode !== 'night' && (() => {
 const amA = byKey.get(`${date}_am`)
 const pmA = byKey.get(`${date}_pm`)
 if (!amA && !pmA) return null
 const amPct = amA && amA.capacity > 0 ? amA.booked / amA.capacity : null
 const pmPct = pmA && pmA.capacity > 0 ? pmA.booked / pmA.capacity : null
 const maxPct = Math.max(amPct ?? 0, pmPct ?? 0)
 if (maxPct < 0.3) return null
 const color = maxPct >= 0.9 ? '#c9928c' : maxPct >= 0.6 ? '#d4a07a' : '#c9b48a'
 return (
 <div style={{ fontSize: '14px', textAlign: 'center', color, marginTop: '2px', fontWeight: 700 }}>
 {amA ? `${amA.booked}/${amA.capacity}` : '–'} · {pmA ? `${pmA.booked}/${pmA.capacity}` : '–'}
 </div>
 )
 })()}

 {!staffMode && anyBookable && mode !== 'night' && (() => {
 const hint = capacityHint(am, pm, seats, tightThreshold)
 return hint ? (
 <div style={{ fontSize: '14px', textAlign: 'center', color: '#d4a07a', marginTop: '2px' }}>{hint}</div>
 ) : null
 })()}
 </div>
 )
 })}
 </div>
 )}

 {detailDate && narrow && mode !== 'night' && (() => {
 // Schritt 2 (Handy): Session groß wählen, dann bestätigen
 const dAm = byKey.get(`${detailDate}_am`)
 const dPm = byKey.get(`${detailDate}_pm`)
 const dLabel = new Date(detailDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
 const isPastDay = detailDate < (today ?? new Date().toISOString().slice(0, 10)) || (notBefore ? detailDate <= notBefore : false)
 const current = picked.find(p => p.date === detailDate)?.session ?? null
 const sel = pendingSession ?? current
 const options: { key: SessionKey | 'tbd'; label: string; sub: string; can: boolean }[] = (['am', 'pm'] as SessionKey[]).map(sess => {
 const a = sess === 'am' ? dAm : dPm
 const blockedReason = !isPastDay && current !== sess ? (blockedSlots?.(detailDate, sess) ?? null) : null
 const can = !isPastDay && !blockedReason && (staffMode ? true : Boolean(a?.bookable) && (a?.max_party ?? 0) >= seats)
 return { key: sess, label: sess === 'am' ? 'Morning' : 'Afternoon', sub: blockedReason ?? (staffMode ? sessionDetailTextStaff(a, seats) : sessionDetailText(a, seats)), can }
 })
 if (allowTbd && staffMode && !isPastDay) options.push({ key: 'tbd', label: ' Instructor decides', sub: 'Time slot set later — ticket for the instructor', can: true })
 const replaceTarget = current ? null : replaceTargetFor(detailDate)
 return (
 <div onClick={compact ? () => setDetailDate(null) : undefined}
 style={compact ? { position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(9,9,9,.6)' } : undefined}>
 <div role={compact ? 'dialog' : undefined} aria-label={compact ? `Choose morning or afternoon for ${dLabel}` : undefined}
 onClick={compact ? e => e.stopPropagation() : undefined}
 style={compact
 ? { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '85vh', overflowY: 'auto', padding: '14px 16px calc(16px + env(safe-area-inset-bottom))', borderRadius: '18px 18px 0 0', background: '#121210', borderTop: '1px solid rgba(243,239,230,.4)', boxShadow: 'none' }
 : { marginTop: '10px', padding: '12px 14px', borderRadius: 0, background: 'rgba(243,239,230,.06)', border: '1px solid rgba(243,239,230,.35)' }}>
 {compact && <div style={{ width: '40px', height: '4px', borderRadius: 0, background: 'rgba(255,255,255,.2)', margin: '0 auto 12px' }} />}
 <div style={{ fontSize: '14px', fontWeight: 800, color: s.text, marginBottom: '8px' }}>{dLabel}<span style={{ fontWeight: 500, color: s.muted }}> · two dives per session</span></div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
 {options.map(o => (
 <button key={o.key} type="button" disabled={!o.can} onClick={() => setPendingSession(o.key)}
 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '11px 12px', borderRadius: 0, textAlign: 'left', fontFamily: s.font, cursor: o.can ? 'pointer' : 'default',
 border: `1px solid ${sel === o.key ? s.accent : o.can ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.05)'}`,
 background: sel === o.key ? 'rgba(243,239,230,.18)' : 'transparent', color: o.can ? s.text : 'rgba(255,255,255,.3)' }}>
 <span style={{ fontSize: '14px', fontWeight: 700 }}>{o.label}</span>
 <span style={{ fontSize: '14px', color: s.muted, textAlign: 'right' }}>{o.sub}</span>
 </button>
 ))}
 </div>
 {replaceTarget && <div style={{ fontSize: '14px', color: '#d4a07a', marginBottom: '8px' }}>This moves your latest pick ({new Date(replaceTarget.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {replaceTarget.session === 'tbd' ? 'TBD' : replaceTarget.session.toUpperCase()}) to {dLabel}.</div>}
 <div style={{ display: 'flex', gap: '8px' }}>
 <button type="button" disabled={!sel || (sel === current)} onClick={() => { if (sel) { toggle(detailDate, sel); setDetailDate(null) } }}
 style={{ flex: 1, padding: '12px', borderRadius: 0, border: 'none', background: s.accent, color: '#000', fontWeight: 800, fontSize: '14px', fontFamily: s.font, cursor: 'pointer', opacity: !sel || sel === current ? .45 : 1 }}>
 {current ? 'Change' : 'Confirm'}
 </button>
 {current && (
 <button type="button" onClick={() => { toggle(detailDate, current); setDetailDate(null) }}
 style={{ padding: '12px 14px', borderRadius: 0, border: '1px solid rgba(201,146,140,.4)', background: 'transparent', color: '#c9928c', fontWeight: 700, fontSize: '14px', fontFamily: s.font, cursor: 'pointer' }}>Remove</button>
 )}
 <button type="button" onClick={() => setDetailDate(null)}
 style={{ padding: '12px 14px', borderRadius: 0, border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: s.muted, fontSize: '14px', fontFamily: s.font, cursor: 'pointer' }}>Close</button>
 </div>
 </div>
 </div>
 )
 })()}

 {detailDate && !narrow && mode !== 'night' && (() => {
 const dAm = byKey.get(`${detailDate}_am`)
 const dPm = byKey.get(`${detailDate}_pm`)
 const dLabel = new Date(detailDate + 'T12:00:00')
 .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
 return (
 <div style={{
 marginTop: '10px', padding: '10px 14px', borderRadius: 0,
 background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)',
 }}>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', alignItems: 'flex-start' }}>
 <div style={{ fontSize: '14px', fontWeight: 700, color: s.sub, minWidth: '80px', paddingTop: '2px', flexShrink: 0 }}>
 {dLabel}
 </div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1, minWidth: '180px' }}>
 {(['am', 'pm'] as SessionKey[]).map(sess => {
 const a = sess === 'am' ? dAm : dPm
 const detail = staffMode
 ? sessionDetailTextStaff(a, seats)
 : sessionDetailText(a, seats)
 const canBook = staffMode ? true : Boolean(a?.bookable) && (a?.max_party ?? 0) >= seats
 // no_boat / past_cutoff are neutral facts; full / group-too-large are soft warnings
 const textColor = !a
 ? 'rgba(255,255,255,.2)'
 : staffMode
 ? (a.capacity > 0 && a.booked + seats > a.capacity ? '#c9928c' : a.booked / Math.max(a.capacity, 1) >= 0.9 ? '#c9928c' : a.booked / Math.max(a.capacity, 1) >= 0.6 ? '#d4a07a' : s.muted)
 : canBook
 ? s.muted
 : (a.reason === 'no_boat' || a.reason === 'past_cutoff')
 ? 'rgba(255,255,255,.3)'
 : '#d4a07a'
 return (
 <div key={sess} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}>
 <span style={{
 fontSize: '14px', fontWeight: 800, padding: '2px 6px', borderRadius: 0,
 background: 'rgba(243,239,230,.14)', color: s.accent, border: '1px solid rgba(243,239,230,.3)',
 flexShrink: 0,
 }}>{sess.toUpperCase()}</span>
 <span style={{ fontSize: '14px', color: textColor, lineHeight: 1.4 }}>{detail}</span>
 {pickedKeys.has(`${detailDate}_${sess}`) && pickedExtra?.({ date: detailDate, session: sess }) && (
 <span style={{ fontSize: '14px', fontWeight: 700, color: s.accent, lineHeight: 1.4 }}> {pickedExtra({ date: detailDate, session: sess })}</span>
 )}
 </div>
 )
 })}
 </div>
 </div>
 </div>
 )
 })()}

 {picked.length > 0 && (
 <div style={{ marginTop: '14px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
 {picked.map(p => (
 <button key={`${p.date}_${p.session}`} type="button" onClick={() => toggle(p.date, p.session)}
 title="Remove this dive day"
 style={{
 fontSize: '14px', fontWeight: 700, padding: '5px 11px', borderRadius: 0,
 background: 'rgba(243,239,230,.12)', color: s.accent, border: '1px solid rgba(243,239,230,.35)',
 cursor: 'pointer', fontFamily: s.font,
 }}>
 {new Date(p.date + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} · {p.session === 'tbd' ? ' TBD' : p.session.toUpperCase()} 
 </button>
 ))}
 </div>
 )}

 {staffMode && (() => {
 const over = picked.filter(p => p.session !== 'tbd').map(p => ({ p, a: byKey.get(`${p.date}_${p.session}`) })).filter(x => x.a && x.a.capacity > 0 && x.a.booked + seats > x.a.capacity)
 if (over.length === 0) return null
 return (
 <div style={{ marginTop: '10px', padding: '9px 12px', borderRadius: 0, background: 'rgba(201,146,140,.1)', border: '1px solid rgba(201,146,140,.4)', fontSize: '14px', lineHeight: 1.55, color: '#c9928c' }}>
 <b>Capacity override:</b> {over.map(x => `${new Date(x.p.date + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${x.p.session.toUpperCase()} is ${x.a!.booked}/${x.a!.capacity} booked`).join(' · ')}. This booking adds {seats} more.
 </div>
 )
 })()}

 {!staffMode && (
 <div style={{ marginTop: '12px', fontSize: '14px', color: s.muted, lineHeight: 1.55 }}>
 Bookings close at 18:00 Azores time the day before. Seats shown are live.
 </div>
 )}
 </div>
 )
}

// Pure helper — no closures, so it lives outside the component.
// `tightThreshold` is passed in so a future 'mode' prop can supply a different value
// for staff/walk-in use without touching the logic here.
function capacityHint(
 am: Availability | undefined,
 pm: Availability | undefined,
 seats: number,
 tightThreshold: number,
): string | null {
 const parts: string[] = []
 for (const [label, a] of [['AM', am], ['PM', pm]] as [string, Availability | undefined][]) {
 if (!a || !a.bookable) continue // no data, no boat, past cutoff, or fully booked
 if (a.max_party < seats) {
 parts.push(`${label} full for ${seats}`) // boat exists but can't fit this group
 } else if (a.max_party < tightThreshold) {
 parts.push(`${label} ${a.max_party} left`)
 }
 }
 return parts.length > 0 ? parts.join(' · ') : null
}

// Pure helper for the detail line under the grid — guest mode.
function sessionDetailText(a: Availability | undefined, seats: number): string {
 if (!a) return 'no data'
 const timeStr = a.departure_time
 ? `be there ${a.departure_time}${a.eta ? `, back ${a.eta}` : ''}`
 : null
 if (!a.bookable) {
 const reasonStr =
 a.reason === 'no_boat' ? 'no boat' :
 a.reason === 'past_cutoff' ? 'past the booking cutoff' :
 a.reason === 'full' ? 'full' :
 `room for ${a.max_party} — you need ${seats}`
 return [timeStr, reasonStr].filter(Boolean).join(' · ')
 }
 if (a.max_party < seats) {
 return [timeStr, `room for ${a.max_party} — you need ${seats}`].filter(Boolean).join(' · ')
 }
 return [timeStr, `${a.seats_left} of ${a.capacity} seats left`].filter(Boolean).join(' · ')
}

// Staff mode detail: shows booked/capacity + status warnings (non-blocking).
function sessionDetailTextStaff(a: Availability | undefined, seats = 1): string {
 if (!a) return 'no data for this session'
 const timeStr = a.departure_time
 ? `${a.departure_time}${a.eta ? ` – ${a.eta}` : ''}`
 : null
 const capStr = a.capacity > 0 ? `${a.booked}/${a.capacity} booked` : 'no capacity data'
 const left = Math.max(0, a.capacity - a.booked)
 const over = a.capacity > 0 && a.booked + seats > a.capacity
 const warn = !a.bookable
 ? (a.reason === 'no_boat' ? ' no boat' :
 a.reason === 'past_cutoff' ? ' past cutoff' :
 a.reason === 'full' ? ' full' : ' restricted')
 : null
 const seatsStr = a.capacity > 0 ? `${left} seat${left === 1 ? '' : 's'} open` : null
 const overStr = over ? ` capacity override (${seats} needed)` : null
 return [timeStr, capStr, seatsStr, warn, overStr].filter(Boolean).join(' · ')
}

const navBtn: React.CSSProperties = {
 width: '32px', height: '32px', borderRadius: 0, cursor: 'pointer', fontSize: '16px',
 background: 'rgba(255,255,255,.05)', color: '#f3efe6', border: '1px solid rgba(255,255,255,.12)',
 fontFamily: 'inherit', lineHeight: 1,
}
