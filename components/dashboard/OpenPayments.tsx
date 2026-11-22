'use client'

/**
 * OpenPayments — Dashboard-Kachel „Open payments".
 * Listet alle Gäste, die an dem gewählten Tag tauchen/kommen und noch Geld offen haben (unpaid / deposit),
 * damit niemand mit Zertifikat oder nach dem Tauchgang nach Hause geht, ohne zu zahlen.
 * Bei „heute" zusätzlich: offene Salden der letzten 14 Tage (Gäste, die schon weg sind).
 * Kein Profil-Klick nötig: Name, Tag, Total, bezahlt, OFFEN stehen direkt in der Zeile.
 */

import React, { useEffect, useState } from 'react'
import { supabase, s } from '@/components/pages/_shared'

type Row = {
 bookingId: string
 name: string
 product: string
 date: string
 sessions: string
 total: number
 paid: number
 due: number
 state: 'unpaid' | 'deposit'
 groupSize: number
}

const eur = (c: number) => `€${(c / 100).toFixed(2)}`
const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })

export default function OpenPayments({ rollDateStr, isToday, simulationMode, reloadKey, onOpen }: {
 rollDateStr: string
 isToday: boolean
 simulationMode: boolean | null
 reloadKey?: number
 onOpen: (bookingId: string) => void
}) {
 const [rows, setRows] = useState<Row[]>([])
 const [loading, setLoading] = useState(true)
 const [err, setErr] = useState<string | null>(null)

 useEffect(() => {
 if (simulationMode === null) return
 let alive = true
 setLoading(true); setErr(null)
 ;(async () => {
 try {
 const from = isToday ? new Date(new Date(rollDateStr + 'T12:00:00').getTime() - 14 * 86400000).toISOString().slice(0, 10) : rollDateStr
 const { data: sess, error: sErr } = await supabase.from('booking_sessions')
 .select('booking_id, session, session_date, status')
 .gte('session_date', from).lte('session_date', rollDateStr).neq('status', 'cancelled')
 if (sErr) throw new Error(sErr.message)
 const ids = [...new Set((sess ?? []).map(x => x.booking_id as string))]
 if (ids.length === 0) { if (alive) { setRows([]); setLoading(false) } return }
 const [{ data: bks, error: bErr }, { data: pays }] = await Promise.all([
 supabase.from('bookings').select('id, customer_name, product_name, amount, payment_state, status, group_size')
 .in('id', ids).eq('is_test', simulationMode).neq('status', 'cancelled').in('payment_state', ['unpaid', 'deposit']),
 supabase.from('booking_payments').select('booking_id, amount, status').in('booking_id', ids).eq('status', 'paid'),
 ])
 if (bErr) throw new Error(bErr.message)
 const paidBy = new Map<string, number>()
 for (const p of pays ?? []) paidBy.set(p.booking_id as string, (paidBy.get(p.booking_id as string) ?? 0) + ((p.amount as number) ?? 0))
 const out: Row[] = []
 for (const b of bks ?? []) {
 const total = (b.amount as number) ?? 0
 const paid = paidBy.get(b.id as string) ?? 0
 const due = total - paid
 if (total <= 0 || due <= 0) continue
 const mine = (sess ?? []).filter(x => x.booking_id === b.id)
 // Für „heute" zählt der späteste Tauchtag der Buchung ≤ Stichtag; Kurse mit mehreren Tagen erscheinen einmal.
 const last = mine.map(x => x.session_date as string).sort().at(-1) ?? rollDateStr
 const sameDay = mine.filter(x => x.session_date === last).map(x => String(x.session).toUpperCase()).join(' + ')
 out.push({ bookingId: b.id as string, name: (b.customer_name as string) ?? '—', product: (b.product_name as string) ?? '—', date: last, sessions: sameDay, total, paid, due, state: b.payment_state as 'unpaid' | 'deposit', groupSize: (b.group_size as number) ?? 1 })
 }
 out.sort((a, b) => (a.date === rollDateStr ? 0 : 1) - (b.date === rollDateStr ? 0 : 1) || b.due - a.due)
 if (alive) { setRows(out); setLoading(false) }
 } catch (e) {
 if (alive) { setErr(e instanceof Error ? e.message : String(e)); setLoading(false) }
 }
 })()
 return () => { alive = false }
 }, [rollDateStr, isToday, simulationMode, reloadKey])

 const todayRows = rows.filter(r => r.date === rollDateStr)
 const earlier = rows.filter(r => r.date !== rollDateStr)
 const totalDue = rows.reduce((a, r) => a + r.due, 0)

 const line = (r: Row) => (
 <div key={r.bookingId} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 12px', borderRadius: 0, background: 'transparent', border: '1px solid var(--line)', marginBottom: '6px', flexWrap: 'wrap' }}>
 <div style={{ flex: 1, minWidth: '180px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>{r.name}{r.groupSize > 1 ? <span style={{ color: s.muted, fontWeight: 500 }}> · {r.groupSize} guests</span> : null}</div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px' }}>{r.product} · {fmtDay(r.date)}{r.sessions ? ` ${r.sessions}` : ''} · <span style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, monospace' }}>{r.bookingId.slice(0, 8).toUpperCase()}</span></div>
 </div>
 <div style={{ fontSize: '14px', color: s.muted, textAlign: 'right' }}>
 <div>total {eur(r.total)}</div>
 <div>paid {eur(r.paid)}</div>
 </div>
 <div style={{ textAlign: 'right', minWidth: '88px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', color: 'var(--text)' }}>{r.state === 'deposit' ? 'BALANCE DUE' : 'UNPAID'}</div>
 <div style={{ fontSize: '17px', fontWeight: 500, color: 'var(--text)' }}>{eur(r.due)}</div>
 </div>
 <button type="button" onClick={() => onOpen(r.bookingId)} style={{ background: 'color-mix(in srgb, var(--text) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--text) 40%, transparent)', color: s.accent, borderRadius: 0, padding: '6px 12px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: s.font }}>Take payment </button>
 </div>
 )

 return (
 <div style={{ background: 'var(--glass)', border: `1px solid ${rows.length > 0 ? 'var(--line)' : 'color-mix(in srgb, var(--text) 15%, transparent)'}`, borderRadius: 0, padding: '20px', marginBottom: '20px' }}>
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', gap: '10px', flexWrap: 'wrap' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.accent }}>Open payments · {fmtDay(rollDateStr)}</div>
 {rows.length > 0 && <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)', background: 'transparent', border: '1px solid var(--line)', padding: '3px 9px', borderRadius: 0 }}>{rows.length} open · {eur(totalDue)}</span>}
 </div>
 {loading ? <div style={{ fontSize: '14px', color: s.muted }}>Loading…</div>
 : err ? <div style={{ fontSize: '14px', color: 'var(--text)' }}> Could not load open payments: {err}</div>
 : rows.length === 0 ? <div style={{ fontSize: '14px', color: s.muted }}> Everyone diving this day has paid</div>
 : (<>
 {todayRows.length > 0 && <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, marginBottom: '6px' }}>DIVING THIS DAY</div>}
 {todayRows.map(line)}
 {earlier.length > 0 && <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)', margin: '12px 0 6px' }}>STILL OPEN FROM THE LAST 14 DAYS</div>}
 {earlier.map(line)}
 </>)}
 </div>
 )
}
