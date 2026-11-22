'use client'

import { isSandboxBooking } from '@/lib/sandboxClient'
import React, { useEffect, useMemo, useState } from 'react'
import { s } from '@/components/pages/_shared'

/**
 * Startdatum für Kurse — ohne AM/PM. Das Zeitfenster legt der Instructor nach der Buchung fest.
 *
 * Ein Startdatum ist wählbar, wenn jeder Kurstag (Start + Folgetage) unter dem Instructor-Cap liegt:
 * innerhalb des Dienstplan-Horizonts zählt der Dienstplan, dahinter das Fallback-Kontingent
 * (capacity_quota). Beides liefert /api/availability/course. Über dem Cap gibt es keinen Hard-Block,
 * sondern den Hinweis, eine Anfrage zu schicken. Bootstage (letzte boatDays Tage) brauchen zusätzlich
 * AM oder PM mit genug Plätzen (/api/availability). Alles wird im Checkout serverseitig nochmal geprüft.
 */

type CourseDay = {
 date: string
 bookable: boolean
 request_only: boolean
 reason: null | 'past_cutoff' | 'no_roster' | 'over_quota' | 'full'
 booked_students: number
 capacity: number | null
}
type BoatRow = { date: string; session: 'am' | 'pm'; max_party: number; reason: null | string }

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function ymd(d: Date) {
 return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtDay(d: string) {
 return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
}
function addDays(d: string, n: number) {
 const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return ymd(x)
}

export default function CourseStartPicker({ productId, days, guests, boatDays, value, onChange, beforeDate, afterDate, onlyYear, blockedDays, requestDay, skipCapacity }: {
 productId: string
 /** Pro-Programme (Divemaster/Dive Guide): immer Anfrage — keine Instructor-/Boots-Prüfung, nur Vergangenheit, Buchungsschluss und gesperrte Fenster */
 skipCapacity?: boolean
 /** Low Season (Buchungsfenster 'request'): ohnehin eine Anfrage — ohne eingetragenen Instructor trotzdem wählbar, kein Hinweis */
 requestDay?: (date: string) => boolean
 /** Buchungsfenster (/book): Grund, wenn ein Kurstag online gesperrt ist — der Start ist dann nicht wählbar */
 blockedDays?: (date: string) => string | null
 /** Optional: nur Kurse, die komplett in diesem Kalenderjahr liegen (alle Buchungen einer Person im selben Jahr) */
 onlyYear?: string | null
 /** Optional: nur Tage VOR diesem Datum wählbar (z. B. Refresher vor dem ersten Tauchtag) */
 beforeDate?: string | null
 /** Optional: nur Tage NACH diesem Datum wählbar (z. B. Tauchtage nach dem Refresher) */
 afterDate?: string | null
 /** Anzahl aufeinanderfolgender Kurstage */
 days: number
 guests: number
 /** Bootstage = letzte N Kurstage; 0 = nie Boot; null = alle */
 boatDays: number | null
 value: string | null
 onChange: (date: string | null) => void
}) {
 // Startmonat: gewähltes Datum, sonst der erste mögliche Tag (morgen bzw. nach afterDate) —
 // nie ein schon vergangener Monat ohne wählbare Tage (am 31.10. öffnete sonst ein leerer Oktober)
 const [cursor, setCursor] = useState(() => {
 const t = ymd(new Date())
 const first = value ?? (afterDate && afterDate >= t ? addDays(afterDate, 1) : addDays(t, 1))
 const d = new Date(first + 'T12:00:00'); d.setDate(1); return d
 })
 const [courseDays, setCourseDays] = useState<CourseDay[] | null>(null)
 const [boat, setBoat] = useState<BoatRow[] | null>(null)
 const [loadError, setLoadError] = useState<string | null>(null)
 const [loading, setLoading] = useState(true)
 // Angetippter „on request"-Tag: nicht wählbar, aber mit Hinweis, uns direkt zu kontaktieren
 const [hintDate, setHintDate] = useState<string | null>(null)

 // Monat + Puffer für die Folgetage eines Starts am Monatsende
 const from = ymd(new Date(cursor.getFullYear(), cursor.getMonth(), 1))
 const to = addDays(ymd(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)), days)

 useEffect(() => {
 let alive = true
 setLoading(true); setLoadError(null)
 Promise.all([
 fetch(`/api/availability/course?from=${from}&to=${to}&course_id=${encodeURIComponent(productId)}${isSandboxBooking() ? '&sandbox=1' : ''}`).then(async r => {
 if (!r.ok) throw new Error(`course availability ${r.status}`)
 return r.json()
 }),
 fetch(`/api/availability?from=${from}&to=${to}${isSandboxBooking() ? '&sandbox=1' : ''}`).then(async r => {
 if (!r.ok) throw new Error(`boat availability ${r.status}`)
 return r.json()
 }),
 ]).then(([c, b]) => {
 if (!alive) return
 setCourseDays((c.days ?? []) as CourseDay[])
 setBoat((b.sessions ?? []) as BoatRow[])
 setLoading(false)
 }).catch(e => {
 if (!alive) return
 setLoadError(e instanceof Error ? e.message : String(e))
 setLoading(false)
 })
 return () => { alive = false }
 }, [from, to, productId])

 const byDate = useMemo(() => new Map((courseDays ?? []).map(d => [d.date, d])), [courseDays])
 const boatByDate = useMemo(() => {
 const m = new Map<string, BoatRow[]>()
 for (const r of boat ?? []) m.set(r.date, [...(m.get(r.date) ?? []), r])
 return m
 }, [boat])

 /** Bewertung eines Startdatums über alle Kurstage */
 function evaluate(start: string): { ok: boolean; requestOnly: boolean; why: string; guestWhy?: string } {
 const boatCount = boatDays === null ? days : Math.min(Math.max(boatDays, 0), days)
 for (let i = 0; i < days; i++) {
 const d = addDays(start, i)
 const c = byDate.get(d)
 if (!c) return { ok: false, requestOnly: false, why: 'Outside the loaded range' }
 const blocked = blockedDays?.(d) ?? null
 if (blocked) return { ok: false, requestOnly: false, why: `${d}: ${blocked}` }
 if (c.reason === 'past_cutoff') return { ok: false, requestOnly: false, why: 'Past the booking cutoff' }
 if (skipCapacity) continue
 const remaining = c.capacity === null ? Infinity : c.capacity - c.booked_students
 const lowSeasonNoRoster = c.reason === 'no_roster' && Boolean(requestDay?.(d))
 if (!lowSeasonNoRoster && (!c.bookable || remaining < guests)) {
 // Grund ehrlich benennen: 'no_roster' = im Dienstplan-Horizont noch kein Instructor eingetragen (nicht „voll")
 const why = c.reason === 'no_roster' ? `No instructor scheduled yet on ${d}`
 : c.reason === 'over_quota' ? `All course places on ${d} are taken`
 : remaining <= 0 || !c.bookable ? `Instructor capacity full on ${d}` : `Only ${remaining} instructor seat(s) left on ${d}`
 const day = fmtDay(d)
 const guestWhy = c.reason === 'no_roster' ? `no instructor is scheduled for ${day} yet`
 : c.reason === 'over_quota' || remaining <= 0 || !c.bookable ? `our course places on ${day} are already taken`
 : `only ${remaining} course place${remaining === 1 ? '' : 's'} left on ${day}`
 return { ok: false, requestOnly: true, why, guestWhy }
 }
 const isBoatDay = i >= days - boatCount
 if (isBoatDay) {
 const rows = boatByDate.get(d) ?? []
 const fits = rows.some(r => r.reason !== 'no_boat' && r.reason !== 'past_cutoff' && r.max_party >= guests)
 if (!fits) return { ok: false, requestOnly: false, why: `No boat seats for ${guests} on ${d}` }
 }
 }
 return { ok: true, requestOnly: false, why: '' }
 }

 const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
 const firstWeekday = (monthStart.getDay() + 6) % 7
 const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
 const today = ymd(new Date())
 const selectedEval = value ? evaluate(value) : null
 // Vergangene Wochen am Anfang des Monats ausblenden: der erste wählbare Tag steht in der obersten Zeile
 const deadDay = (n: number) => { const d = ymd(new Date(cursor.getFullYear(), cursor.getMonth(), n)); return d <= today || Boolean(afterDate && d <= afterDate) }
 let dropRows = 0
 for (let r = 0; r * 7 < firstWeekday + daysInMonth; r++) {
 const nums = Array.from({ length: 7 }, (_, c) => r * 7 + c - firstWeekday + 1).filter(n => n >= 1 && n <= daysInMonth)
 if (nums.length > 0 && nums.every(deadDay)) dropRows++; else break
 }
 const leadEmpty = Math.max(0, firstWeekday - dropRows * 7)
 const dayStart = Math.max(0, dropRows * 7 - firstWeekday)
 // Zurück nur, solange der Vormonat noch wählbare (zukünftige) Tage hat
 const prevMonthLast = ymd(new Date(cursor.getFullYear(), cursor.getMonth(), 0))
 const canPrev = prevMonthLast > today && !(afterDate && prevMonthLast <= afterDate)

 return (
 <div>
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
 <button type="button" disabled={!canPrev} onClick={() => { setHintDate(null); setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)) }} style={{ ...navBtn, opacity: canPrev ? 1 : 0.3, cursor: canPrev ? 'pointer' : 'default' }}>‹</button>
 <div style={{ fontSize: '14px', fontWeight: 800, color: s.text }}>{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</div>
 <button type="button" onClick={() => { setHintDate(null); setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) }} style={navBtn}>›</button>
 </div>
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
 {WEEKDAYS.map(w => <div key={w} style={{ textAlign: 'center', fontSize: '14px', color: s.muted, fontWeight: 700 }}>{w}</div>)}
 </div>
 {loadError && (
 <div style={{ fontSize: '14px', color: '#c9928c', background: 'rgba(201,146,140,.08)', border: '1px solid rgba(201,146,140,.25)', borderRadius: 0, padding: '8px 10px', marginBottom: '8px' }}>
 Could not load availability: {loadError}
 </div>
 )}
 {loading && !loadError && (
 <div role="status" aria-label="Loading availability" style={{ minHeight: '190px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
 <style>{'@keyframes azdSpin{to{transform:rotate(360deg)}}'}</style>
 <div style={{ width: '34px', height: '34px', borderRadius: '50%', border: '3px solid rgba(243,239,230,.18)', borderTopColor: '#f3efe6', animation: 'azdSpin .8s linear infinite' }} />
 </div>
 )}
 <div style={{ display: loading && !loadError ? 'none' : 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', opacity: loading ? .5 : 1 }}>
 {Array.from({ length: leadEmpty }).map((_, i) => <div key={`e${i}`} />)}
 {Array.from({ length: daysInMonth - dayStart }).map((_, k) => {
 const i = k + dayStart
 const d = ymd(new Date(cursor.getFullYear(), cursor.getMonth(), i + 1))
 const past = d <= today
 const tooLate = Boolean(beforeDate && d >= beforeDate) || Boolean(afterDate && d <= afterDate)
 const wrongYear = Boolean(onlyYear && (d.slice(0, 4) !== onlyYear || addDays(d, days - 1).slice(0, 4) !== onlyYear))
 const ev = past || tooLate || wrongYear || loading || !courseDays ? null : evaluate(d)
 const selectable = Boolean(ev?.ok)
 const isSel = value === d
 const inRange = value ? d >= value && d < addDays(value, days) : false
 // „On request"-Tage sind antippbar: kein Auswählen, sondern der Kontakt-Hinweis darunter (Lucas 31.10.)
 const tappable = selectable || Boolean(ev?.requestOnly)
 const isHint = hintDate === d
 return (
 <button key={d} type="button" disabled={!tappable}
 title={wrongYear ? `All bookings of one guest must be in the same calendar year (${onlyYear})` : tooLate ? (afterDate && d <= afterDate ? 'Must be after your Scuba Skills Update' : 'Must be before your first dive day') : ev && !ev.ok ? ev.why : undefined}
 onClick={() => { if (selectable) { setHintDate(null); onChange(isSel ? null : d) } else setHintDate(isHint ? null : d) }}
 style={{
 padding: '9px 0', borderRadius: 0, fontFamily: 'inherit', fontSize: '14px', fontWeight: isSel || isHint ? 800 : 600,
 border: `1px solid ${isSel ? 'rgba(243,239,230,.7)' : inRange ? 'rgba(243,239,230,.35)' : isHint ? 'rgba(212,160,122,.85)' : ev?.requestOnly ? 'rgba(212,160,122,.35)' : 'rgba(255,255,255,.08)'}`,
 background: isSel ? 'rgba(243,239,230,.25)' : inRange ? 'rgba(243,239,230,.1)' : isHint ? 'rgba(212,160,122,.2)' : ev?.requestOnly ? 'rgba(212,160,122,.08)' : 'transparent',
 color: past || tooLate || wrongYear ? 'rgba(255,255,255,.18)' : selectable ? s.text : ev?.requestOnly ? '#d4a07a' : 'rgba(255,255,255,.3)',
 cursor: tappable ? 'pointer' : 'not-allowed',
 }}>
 {i + 1}
 </button>
 )
 })}
 </div>
 <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px', fontSize: '14px', color: s.muted }}>
 <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: 0, background: 'rgba(212,160,122,.4)', marginRight: '5px', verticalAlign: 'middle' }} />On request — tap the date for details</span>
 <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: 0, background: 'rgba(255,255,255,.12)', marginRight: '5px', verticalAlign: 'middle' }} />Not available</span>
 </div>
 {hintDate && (() => {
 const hEv = courseDays && !loading ? evaluate(hintDate) : null
 if (!hEv || hEv.ok || !hEv.requestOnly) return null
 return (
 <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: 0, background: 'rgba(212,160,122,.1)', border: '1px solid rgba(212,160,122,.35)', fontSize: '14px', color: '#d4a07a', lineHeight: 1.55 }}>
 <b style={{ color: '#d4a07a' }}>A start on {fmtDay(hintDate)} can&apos;t be booked online</b> — {hEv.guestWhy ?? hEv.why}.
 {' '}Still want to do your course that week? Reach out to us directly and we&apos;ll see what&apos;s possible.{' '}
 <a href={`/contact?product=${encodeURIComponent(productId)}&date=${hintDate}`} style={{ color: '#d4a07a', fontWeight: 700 }}>Contact us </a>
 </div>
 )
 })()}
 {value && selectedEval && !selectedEval.ok && (
 <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: 0, background: 'rgba(212,160,122,.1)', border: '1px solid rgba(212,160,122,.35)', fontSize: '14px', color: '#d4a07a', lineHeight: 1.5 }}>
 {selectedEval.why}. {selectedEval.requestOnly && <>We need to plan capacity for this date — <a href={`/contact?product=${encodeURIComponent(productId)}&date=${value}`} style={{ color: '#d4a07a', fontWeight: 700 }}>send us a request</a>.</>}
 </div>
 )}
 {value && selectedEval?.ok && (
 <div style={{ marginTop: '10px', fontSize: '14px', color: s.sub, lineHeight: 1.6 }}>
 {Array.from({ length: days }).map((_, i) => addDays(value, i)).map(d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })).join(' · ')}
 <span style={{ color: s.muted }}> — start time confirmed by your instructor</span>
 </div>
 )}
 </div>
 )
}

const navBtn: React.CSSProperties = {
 width: '32px', height: '32px', borderRadius: 0, border: '1px solid rgba(255,255,255,.12)', background: 'transparent',
 color: '#f3efe6', fontSize: '18px', cursor: 'pointer', fontFamily: 'inherit',
}
