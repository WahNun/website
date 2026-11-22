'use client'

/**
 * CourseLoad — B-5 Dashboard Widget
 *
 * Zeigt für die nächsten 14 Tage wie viele Kursstudenten gebucht sind
 * vs. dem Tageskontingent aus capacity_quota. Frühwarnung ab 80 %.
 */

import React, { useEffect, useState } from 'react'
import { supabase, s } from '@/components/pages/_shared'
import { INSTRUCTOR_PRODUCT_TYPES } from '@/lib/productType'
import FrontOfficeBookings from '@/components/pages/FrontOfficeBookings'

type DayLoad = {
 date: string
 students: number
 quota: number
 courses: { name: string; students: number }[]
}

type DetailRow = {
 key: string
 bookingId: string
 session: string
 startTime: string | null
 isBoatDay: boolean | null
 boatName: string | null
 product: string
 groupSize: number
 guests: string[]
 payer: string | null
 status: string
 paymentState: string | null
 isTest: boolean
 notes: string | null
}

type Props = {
 rollDateStr: string
 isAdmin: boolean
 simulationMode?: boolean
 reloadKey?: number
}

function fmt(d: string) {
 return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
}

export default function CourseLoad({ rollDateStr, isAdmin, simulationMode = false, reloadKey = 0 }: Props) {
 const [days, setDays] = useState<DayLoad[]>([])
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState<string | null>(null)
 const [openDate, setOpenDate] = useState<string | null>(null)
 const [detail, setDetail] = useState<DetailRow[]>([])
 const [detailLoading, setDetailLoading] = useState(false)
 const [detailErr, setDetailErr] = useState<string | null>(null)
 const [bookingPopup, setBookingPopupRaw] = useState<string | null>(null)
 const [localReload, setLocalReload] = useState(0)
 const setBookingPopup = (id: string | null) => { setBookingPopupRaw(id); if (id === null) { setLocalReload(k => k + 1); if (openDate) void openDay(openDate) } }

 async function openDay(date: string) {
 setOpenDate(date); setDetail([]); setDetailErr(null); setDetailLoading(true)
 const { data, error: dErr } = await supabase
 .from('booking_sessions')
 .select(`
 id, booking_id, session, start_time, is_boat_day, boat_id, notes, status,
 bookings!inner (
 id, product_name, product_type, group_size, status, payment_state, customer_name, is_test,
 booking_customers!booking_customers_booking_id_is_test_fkey ( slot_index, guest_name, customers!booking_customers_customer_id_fkey ( name ) )
 )
 `)
 .eq('session_date', date)
 .eq('status', 'booked')
 .in('is_test', simulationMode ? [true, false] : [false])
 .in('bookings.product_type', [...INSTRUCTOR_PRODUCT_TYPES])
 if (dErr) { setDetailErr(`Course details: ${dErr.message}`); setDetailLoading(false); return }
 const { data: boatRows } = await supabase.from('boats').select('id,name')
 const boatName = new Map((boatRows ?? []).map((b: any) => [b.id as string, b.name as string]))
 const rows: DetailRow[] = ((data ?? []) as any[])
 .filter(r => r.bookings && r.bookings.status !== 'cancelled')
 .map(r => {
 const b = r.bookings
 const slots = [...(b.booking_customers ?? [])].sort((x: any, y: any) => x.slot_index - y.slot_index)
 const guests = slots.map((c: any) => (c.guest_name?.trim() || c.customers?.name || '').trim()).filter(Boolean)
 return {
 key: r.id, bookingId: b.id, session: String(r.session ?? '').toLowerCase(), startTime: r.start_time ?? null,
 isBoatDay: r.is_boat_day ?? null, boatName: r.boat_id ? (boatName.get(r.boat_id) ?? null) : null,
 product: b.product_name, groupSize: b.group_size ?? 1, guests, payer: b.customer_name ?? null,
 status: b.status, paymentState: b.payment_state ?? null, isTest: Boolean(b.is_test), notes: r.notes ?? null,
 }
 })
 const order: Record<string, number> = { am: 0, pm: 1, full: 2, tbd: 3 }
 rows.sort((a, b) => (order[a.session] ?? 9) - (order[b.session] ?? 9) || a.product.localeCompare(b.product))
 setDetail(rows); setDetailLoading(false)
 }

 useEffect(() => {
 let cancelled = false

 async function load() {
 setLoading(true); setError(null)

 const from = rollDateStr
 const toDate = new Date(rollDateStr + 'T12:00:00')
 toDate.setDate(toDate.getDate() + 13)
 const to = toDate.toISOString().slice(0, 10)

 // 1. Gebuchte Sessions im Fenster
 const { data: sessRows, error: sessErr } = await supabase
 .from('booking_sessions')
 .select(`
 session_date,
 bookings!inner (
 group_size,
 product_name,
 product_type,
 status
 )
 `)
 .gte('session_date', from)
 .lte('session_date', to)
 .eq('status', 'booked')
 .in('is_test', simulationMode ? [true, false] : [false])
 .in('bookings.product_type', [...INSTRUCTOR_PRODUCT_TYPES])

 if (sessErr) {
 if (!cancelled) { setError(`Course sessions: ${sessErr.message}`); setLoading(false) }
 return
 }

 // Nach Datum gruppieren (nur Kurse)
 const byDate = new Map<string, { students: number; courses: Map<string, number> }>()
 for (const row of (sessRows ?? [])) {
 const b = (row as any).bookings
 if (!b) continue
 if (b.status === 'cancelled') continue

 const date = (row as any).session_date as string
 if (!byDate.has(date)) byDate.set(date, { students: 0, courses: new Map() })
 const entry = byDate.get(date)!
 entry.students += b.group_size ?? 1
 entry.courses.set(b.product_name, (entry.courses.get(b.product_name) ?? 0) + (b.group_size ?? 1))
 }

 // 2. capacity_quota
 const { data: quotaRows, error: quotaErr } = await supabase
 .from('capacity_quota')
 .select('valid_from, valid_to, max_course_students, priority')
 .eq('is_test', false)
 .lte('valid_from', to)
 .gte('valid_to', from)
 .order('priority', { ascending: false })

 if (quotaErr) {
 if (!cancelled) { setError(`Capacity quota: ${quotaErr.message}`); setLoading(false) }
 return
 }

 function quotaForDate(d: string): number {
 if (!quotaRows || quotaRows.length === 0) return 4
 let best: { priority: number; max: number } | null = null
 for (const q of quotaRows as any[]) {
 if (q.valid_from <= d && q.valid_to >= d) {
 if (!best || q.priority > best.priority) {
 best = { priority: q.priority, max: q.max_course_students }
 }
 }
 }
 return best?.max ?? 4
 }

 // 3. DayLoad-Array
 const result: DayLoad[] = []
 for (let i = 0; i < 14; i++) {
 const d = new Date(from + 'T12:00:00')
 d.setDate(d.getDate() + i)
 const dateStr = d.toISOString().slice(0, 10)
 const entry = byDate.get(dateStr)
 const quota = quotaForDate(dateStr)
 result.push({
 date: dateStr,
 students: entry?.students ?? 0,
 quota,
 courses: entry
 ? [...entry.courses.entries()].map(([name, students]) => ({ name, students }))
 : [],
 })
 }

 if (!cancelled) {
 setDays(result)
 setLoading(false)
 }
 }

 load()
 return () => { cancelled = true }
 }, [rollDateStr, simulationMode, reloadKey, localReload])

 const activeDays = days.filter(d => d.students > 0)
 const warningDays = days.filter(d => d.students > 0 && d.students / d.quota >= 0.8)
 const totalStudents = activeDays.reduce((sum, d) => sum + d.students, 0)

 return (
 <div style={{
 background: 'var(--glass)',
 border: `1px solid ${warningDays.length > 0 ? 'var(--line)' : 'color-mix(in srgb, var(--text) 15%, transparent)'}`,
 borderRadius: 'var(--radius-card)',
 padding: '20px',
 overflow: 'hidden',
 }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.accent, marginBottom: '4px' }}>
 Course Load
 </div>
 <div style={{ fontSize: '14px', color: s.muted }}>Next 14 days</div>
 </div>
 {loading && <span style={{ fontSize: '14px', color: s.muted, fontWeight: 500 }}>Loading…</span>}
 {!loading && (
 <span style={{ fontSize: '14px', color: s.muted }}>
 {totalStudents > 0 ? `${totalStudents} student${totalStudents === 1 ? '' : 's'} booked` : 'No courses booked'}
 </span>
 )}
 </div>

 {error && (
 <div style={{ fontSize: '14px', color: 'var(--text)', padding: '10px', background: 'transparent', borderRadius: 'var(--radius-control)' }}>{error}</div>
 )}

 {!loading && !error && days.length > 0 && (
 <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
 {days.map(day => {
 const pct = day.quota > 0 ? day.students / day.quota : 0
 const hasStudents = day.students > 0
 const isWarning = pct >= 0.8 && pct < 1
 const isFull = pct >= 1
 const isToday = day.date === rollDateStr
 const barColor = isFull ? 'var(--text)' : isWarning ? 'var(--text)' : 'var(--accent)'
 const bgBase = isToday ? 'color-mix(in srgb, var(--text) 10%, transparent)' : hasStudents ? 'color-mix(in srgb, var(--text) 5%, transparent)' : 'transparent'

 return (
 <div key={day.date} onClick={hasStudents ? () => openDay(day.date) : undefined}
 title={hasStudents ? 'Show courses, guests and sessions' : undefined}
 style={{
 display: 'flex', alignItems: 'center', gap: '10px',
 padding: '8px 10px', borderRadius: 'var(--radius-control)',
 cursor: hasStudents ? 'pointer' : 'default',
 background: bgBase,
 border: isToday ? '1px solid color-mix(in srgb, var(--text) 30%, transparent)' : '1px solid transparent',
 }}>
 <div style={{
 fontSize: '14px', minWidth: '80px', flexShrink: 0,
 color: isToday ? s.accent : hasStudents ? s.text : s.muted,
 fontWeight: isToday ? 500 : hasStudents ? 500 : 400,
 }}>
 {fmt(day.date)}
 </div>
 <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,.07)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
 {hasStudents && (
 <div style={{ height: '100%', width: `${Math.min(100, pct * 100)}%`, background: barColor, borderRadius: 'var(--radius-card)' }} />
 )}
 </div>
 <div style={{
 fontSize: '14px', fontWeight: 500, minWidth: '52px', textAlign: 'right', flexShrink: 0,
 color: isFull ? 'var(--text)' : isWarning ? 'var(--text)' : hasStudents ? s.text : s.muted,
 }}>
 {hasStudents ? `${day.students}/${day.quota}` : `—/${day.quota}`}
 </div>
 </div>
 )
 })}
 </div>
 )}

 {!loading && activeDays.length > 0 && (
 <div style={{ marginTop: '14px', borderTop: '1px solid rgba(255,255,255,.07)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
 {activeDays.slice(0, 5).map(day => (
 <div key={day.date} style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
 <span style={{ fontSize: '14px', color: s.muted, minWidth: '72px', flexShrink: 0 }}>{fmt(day.date)}</span>
 {day.courses.map(c => (
 <span key={c.name} style={{ fontSize: '14px', padding: '2px 8px', borderRadius: 'var(--radius-control)', background: 'color-mix(in srgb, var(--text) 10%, transparent)', color: 'var(--text)', fontWeight: 500, whiteSpace: 'nowrap' }}>
 {c.name} · {c.students}
 </span>
 ))}
 </div>
 ))}
 {activeDays.length > 5 && (
 <div style={{ fontSize: '14px', color: s.muted }}>+{activeDays.length - 5} more days with bookings</div>
 )}
 </div>
 )}

 {!loading && warningDays.length > 0 && (
 <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: 'var(--radius-card)', background: 'transparent', border: '1px solid var(--line)', fontSize: '14px', color: 'var(--text)', lineHeight: 1.5 }}>
 {warningDays.length} day{warningDays.length === 1 ? '' : 's'} near or at quota:
 {' '}{warningDays.map(d => fmt(d.date)).join(', ')}
 {warningDays.some(d => d.students >= d.quota) && ' — next booking triggers request-only.'}
 </div>
 )}

 {!loading && isAdmin && (
 <div style={{ marginTop: '10px', fontSize: '14px', color: s.muted, lineHeight: 1.4 }}>
 Soft cap: {days[0]?.quota ?? 4}/day · above quota request-only
 </div>
 )}

 {openDate && (
 <div onClick={() => setOpenDate(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
 <div onClick={e => e.stopPropagation()} style={{ width: 'min(760px, 100%)', background: 'var(--surface)', border: '1px solid color-mix(in srgb, var(--text) 25%, transparent)', borderRadius: 'var(--radius-card)', boxShadow: 'none' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
 <span style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>Courses · {fmt(openDate)}</span>
 <button type="button" onClick={() => setOpenDate(null)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: s.text, borderRadius: 'var(--radius-control)', padding: '6px 12px', fontSize: '14px', cursor: 'pointer' }}>Close </button>
 </div>
 <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
 {detailLoading && <div style={{ fontSize: '14px', color: s.muted }}>Loading…</div>}
 {detailErr && <div style={{ fontSize: '14px', color: 'var(--text)', padding: '10px', background: 'transparent', borderRadius: 'var(--radius-card)' }}>{detailErr}</div>}
 {!detailLoading && !detailErr && detail.length === 0 && <div style={{ fontSize: '14px', color: s.muted }}>No course sessions found for this day.</div>}
 {detail.map(r => {
 const tbd = r.session === 'tbd'
 const where = r.isBoatDay === false ? 'Pool / harbour' : r.boatName ? `Boat: ${r.boatName}` : tbd ? 'Not planned yet' : 'Boat (not assigned)'
 return (
 <div key={r.key} style={{ padding: '12px 14px', borderRadius: 'var(--radius-card)', background: 'color-mix(in srgb, var(--text) 5%, transparent)', border: `1px solid ${tbd ? 'var(--line)' : 'color-mix(in srgb, var(--text) 15%, transparent)'}` }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>
 {r.product}{r.isTest && <span style={{ marginLeft: '8px', fontSize: '14px', color: 'var(--text)', fontWeight: 500 }}>TEST</span>}
 </div>
 <span style={{ fontSize: '14px', fontWeight: 500, padding: '2px 9px', borderRadius: 'var(--radius-control)', background: tbd ? 'transparent' : 'color-mix(in srgb, var(--text) 12%, transparent)', color: tbd ? 'var(--text)' : 'var(--accent)' }}>
 {tbd ? 'Time to be set' : r.session.toUpperCase()}{r.startTime ? ` · ${String(r.startTime).slice(0, 5)}` : ''}
 </span>
 </div>
 <div style={{ marginTop: '6px', fontSize: '14px', color: s.muted, lineHeight: 1.6 }}>
 <div> {r.groupSize} {r.groupSize === 1 ? 'guest' : 'guests'}: <span style={{ color: s.text }}>{r.guests.length > 0 ? r.guests.join(', ') : (r.payer ?? '—')}</span>{r.guests.length === 0 && ' (not checked in yet)'}</div>
 {r.payer && r.guests.length > 0 && !r.guests.includes(r.payer) && <div> Payer: {r.payer}</div>}
 <div> {where}</div>
 <div>Status: {r.status}{r.paymentState ? ` · ${r.paymentState}` : ''}</div>
 {r.notes && <div> {r.notes}</div>}
 </div>
 <div style={{ marginTop: '8px' }}>
 <button type="button" onClick={() => setBookingPopup(r.bookingId)} style={{ background: 'color-mix(in srgb, var(--text) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--text) 35%, transparent)', color: 'var(--text)', borderRadius: 'var(--radius-control)', padding: '5px 12px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
 Open booking {r.bookingId.slice(0, 8).toUpperCase()} 
 </button>
 </div>
 </div>
 )
 })}
 </div>
 </div>
 </div>
 )}

 {bookingPopup && (
 <div onClick={() => setBookingPopup(null)} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
 <div onClick={e => e.stopPropagation()} style={{ width: 'min(920px, 100%)', background: 'var(--surface)', border: '1px solid color-mix(in srgb, var(--text) 25%, transparent)', borderRadius: 'var(--radius-card)', boxShadow: 'none' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
 <span style={{ fontSize: '14px', color: s.muted }}>Booking <span style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', color: s.text, fontWeight: 500 }}>{bookingPopup.slice(0, 8).toUpperCase()}</span></span>
 <button type="button" onClick={() => setBookingPopup(null)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: s.text, borderRadius: 'var(--radius-control)', padding: '6px 12px', fontSize: '14px', cursor: 'pointer' }}>Close </button>
 </div>
 <div style={{ padding: '14px' }}>
 <FrontOfficeBookings focusBookingId={bookingPopup} embedded initialTab="sessions" />
 </div>
 </div>
 </div>
 )}
 </div>
 )
}
