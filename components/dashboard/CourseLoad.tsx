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
      background: 'rgba(10,28,50,.7)',
      border: `1px solid ${warningDays.length > 0 ? 'rgba(255,160,64,.4)' : 'rgba(243,239,230,.15)'}`,
      borderRadius: '14px',
      padding: '20px',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', color: s.accent, marginBottom: '4px' }}>
            Course Load
          </div>
          <div style={{ fontSize: '12.5px', color: s.muted }}>Next 14 days</div>
        </div>
        {loading && <span style={{ fontSize: '12px', color: s.muted, fontWeight: 600 }}>Loading…</span>}
        {!loading && (
          <span style={{ fontSize: '12.5px', color: s.muted }}>
            {totalStudents > 0 ? `${totalStudents} student${totalStudents === 1 ? '' : 's'} booked` : 'No courses booked'}
          </span>
        )}
      </div>

      {error && (
        <div style={{ fontSize: '12px', color: '#ff8b70', padding: '10px', background: 'rgba(255,96,64,.1)', borderRadius: '8px' }}>{error}</div>
      )}

      {!loading && !error && days.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {days.map(day => {
            const pct = day.quota > 0 ? day.students / day.quota : 0
            const hasStudents = day.students > 0
            const isWarning = pct >= 0.8 && pct < 1
            const isFull = pct >= 1
            const isToday = day.date === rollDateStr
            const barColor = isFull ? '#ff6040' : isWarning ? '#ffa040' : '#f3efe6'
            const bgBase = isToday ? 'rgba(243,239,230,.1)' : hasStudents ? 'rgba(243,239,230,.05)' : 'transparent'

            return (
              <div key={day.date} onClick={hasStudents ? () => openDay(day.date) : undefined}
                title={hasStudents ? 'Show courses, guests and sessions' : undefined}
                style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '8px 10px', borderRadius: '8px',
                cursor: hasStudents ? 'pointer' : 'default',
                background: bgBase,
                border: isToday ? '1px solid rgba(243,239,230,.3)' : '1px solid transparent',
              }}>
                <div style={{
                  fontSize: '12.5px', minWidth: '80px', flexShrink: 0,
                  color: isToday ? s.accent : hasStudents ? s.text : s.muted,
                  fontWeight: isToday ? 800 : hasStudents ? 700 : 400,
                }}>
                  {fmt(day.date)}
                </div>
                <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,.07)', borderRadius: '999px', overflow: 'hidden' }}>
                  {hasStudents && (
                    <div style={{ height: '100%', width: `${Math.min(100, pct * 100)}%`, background: barColor, borderRadius: '999px' }} />
                  )}
                </div>
                <div style={{
                  fontSize: '12px', fontWeight: 700, minWidth: '52px', textAlign: 'right', flexShrink: 0,
                  color: isFull ? '#ff6040' : isWarning ? '#ffa040' : hasStudents ? s.text : s.muted,
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
              <span style={{ fontSize: '12.5px', color: s.muted, minWidth: '72px', flexShrink: 0 }}>{fmt(day.date)}</span>
              {day.courses.map(c => (
                <span key={c.name} style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(243,239,230,.1)', color: '#f3efe6', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {c.name} · {c.students}
                </span>
              ))}
            </div>
          ))}
          {activeDays.length > 5 && (
            <div style={{ fontSize: '12.5px', color: s.muted }}>+{activeDays.length - 5} more days with bookings</div>
          )}
        </div>
      )}

      {!loading && warningDays.length > 0 && (
        <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,160,64,.1)', border: '1px solid rgba(255,160,64,.3)', fontSize: '12px', color: '#ffa040', lineHeight: 1.5 }}>
          ⚠ {warningDays.length} day{warningDays.length === 1 ? '' : 's'} near or at quota:
          {' '}{warningDays.map(d => fmt(d.date)).join(', ')}
          {warningDays.some(d => d.students >= d.quota) && ' — next booking triggers request-only.'}
        </div>
      )}

      {!loading && isAdmin && (
        <div style={{ marginTop: '10px', fontSize: '12px', color: s.muted, lineHeight: 1.4 }}>
          Soft cap: {days[0]?.quota ?? 4}/day · above quota → request-only
        </div>
      )}

      {openDate && (
        <div onClick={() => setOpenDate(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(2,8,20,.78)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(760px, 100%)', background: '#07162B', border: '1px solid rgba(243,239,230,.25)', borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: s.text }}>Courses · {fmt(openDate)}</span>
              <button type="button" onClick={() => setOpenDate(null)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: s.text, borderRadius: '7px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}>Close ✕</button>
            </div>
            <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {detailLoading && <div style={{ fontSize: '12px', color: s.muted }}>Loading…</div>}
              {detailErr && <div style={{ fontSize: '12px', color: '#ff8b70', padding: '10px', background: 'rgba(255,96,64,.1)', borderRadius: '8px' }}>{detailErr}</div>}
              {!detailLoading && !detailErr && detail.length === 0 && <div style={{ fontSize: '12px', color: s.muted }}>No course sessions found for this day.</div>}
              {detail.map(r => {
                const tbd = r.session === 'tbd'
                const where = r.isBoatDay === false ? 'Pool / harbour' : r.boatName ? `Boat: ${r.boatName}` : tbd ? 'Not planned yet' : 'Boat (not assigned)'
                return (
                  <div key={r.key} style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(243,239,230,.05)', border: `1px solid ${tbd ? 'rgba(255,208,128,.4)' : 'rgba(243,239,230,.15)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 800, color: s.text }}>
                        {r.product}{r.isTest && <span style={{ marginLeft: '8px', fontSize: '11.5px', color: '#ffd080', fontWeight: 700 }}>TEST</span>}
                      </div>
                      <span style={{ fontSize: '12.5px', fontWeight: 800, padding: '2px 9px', borderRadius: '999px', background: tbd ? 'rgba(255,208,128,.15)' : 'rgba(243,239,230,.12)', color: tbd ? '#ffd080' : '#f3efe6' }}>
                        {tbd ? 'Time to be set' : r.session.toUpperCase()}{r.startTime ? ` · ${String(r.startTime).slice(0, 5)}` : ''}
                      </span>
                    </div>
                    <div style={{ marginTop: '6px', fontSize: '12px', color: s.muted, lineHeight: 1.6 }}>
                      <div>👥 {r.groupSize} {r.groupSize === 1 ? 'guest' : 'guests'}: <span style={{ color: s.text }}>{r.guests.length > 0 ? r.guests.join(', ') : (r.payer ?? '—')}</span>{r.guests.length === 0 && ' (not checked in yet)'}</div>
                      {r.payer && r.guests.length > 0 && !r.guests.includes(r.payer) && <div>💳 Payer: {r.payer}</div>}
                      <div>📍 {where}</div>
                      <div>Status: {r.status}{r.paymentState ? ` · ${r.paymentState}` : ''}</div>
                      {r.notes && <div>📝 {r.notes}</div>}
                    </div>
                    <div style={{ marginTop: '8px' }}>
                      <button type="button" onClick={() => setBookingPopup(r.bookingId)} style={{ background: 'rgba(243,239,230,.12)', border: '1px solid rgba(243,239,230,.35)', color: '#f3efe6', borderRadius: '7px', padding: '5px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                        Open booking {r.bookingId.slice(0, 8).toUpperCase()} →
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
        <div onClick={() => setBookingPopup(null)} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(2,8,20,.78)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(920px, 100%)', background: '#07162B', border: '1px solid rgba(243,239,230,.25)', borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
              <span style={{ fontSize: '12px', color: s.muted }}>Booking <span style={{ fontFamily: 'monospace', color: s.text, fontWeight: 700 }}>{bookingPopup.slice(0, 8).toUpperCase()}</span></span>
              <button type="button" onClick={() => setBookingPopup(null)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: s.text, borderRadius: '7px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}>Close ✕</button>
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
