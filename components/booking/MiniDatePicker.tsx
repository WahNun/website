'use client'
import { useState } from 'react'

const MONTH_NAMES = [
 'January','February','March','April','May','June',
 'July','August','September','October','November','December',
]
const DAY_LABELS = ['Mo','Tu','We','Th','Fr','Sa','Su']

interface Props {
 value: string // YYYY-MM-DD or ''
 onChange: (v: string) => void
 max?: string // YYYY-MM-DD (inclusive)
}

export default function MiniDatePicker({ value, onChange, max }: Props) {
 const today = new Date()
 const initial = value
 ? new Date(value + 'T12:00:00')
 : today
 const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() })
 // Klick auf Monat/Jahr in der Kopfzeile: Jahr- bzw. Monatsliste statt Pfeil für Pfeil zurückzublättern
 const [pick, setPick] = useState<'days' | 'years' | 'months'>('days')

 const maxDate = max ? new Date(max + 'T23:59:59') : null

 const firstDay = new Date(view.year, view.month, 1)
 const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
 const startDow = (firstDay.getDay() + 6) % 7 // Mon = 0

 const cells: (number | null)[] = [
 ...Array(startDow).fill(null),
 ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
 ]

 const navBtn = (dir: -1 | 1) => () => {
 setView(v => {
 const d = new Date(v.year, v.month + dir)
 return { year: d.getFullYear(), month: d.getMonth() }
 })
 }

 const s = {
 accent: 'var(--accent)',
 muted: 'rgba(255,255,255,.38)',
 text: 'var(--accent)',
 bg: 'var(--bg)',
 }

 return (
 <div style={{
 position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200,
 background: s.bg, border: '1px solid color-mix(in srgb, var(--text) 30%, transparent)', borderRadius: 'var(--radius-card)',
 padding: '18px', minWidth: '300px', boxShadow: 'none',
 }}>
 {/* Header */}
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
 <span style={{ fontWeight: 500, color: s.text, fontSize: '14px', display: 'flex', gap: '6px' }}>
 <button type="button" onClick={() => setPick(pick === 'months' ? 'days' : 'months')}
 style={{ background: pick === 'months' ? 'color-mix(in srgb, var(--text) 15%, transparent)' : 'none', border: 'none', borderRadius: 'var(--radius-control)', padding: '2px 6px', color: 'inherit', font: 'inherit', cursor: 'pointer' }}>{MONTH_NAMES[view.month]}</button>
 <button type="button" onClick={() => setPick(pick === 'years' ? 'days' : 'years')} title="Pick a year"
 style={{ background: pick === 'years' ? 'color-mix(in srgb, var(--text) 15%, transparent)' : 'none', border: 'none', borderRadius: 'var(--radius-control)', padding: '2px 6px', color: s.accent, font: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>{view.year}</button>
 </span>
 {pick === 'days' && (
 <div style={{ display: 'flex', gap: '6px' }}>
 {(['',''] as const).map((arrow, i) => (
 <button
 key={arrow}
 type="button"
 onClick={navBtn(i === 0 ? -1 : 1)}
 style={{
 background: 'rgba(255,255,255,.07)', border: 'none', borderRadius: 'var(--radius-control)',
 color: s.text, cursor: 'pointer', padding: '4px 9px', fontSize: '14px', lineHeight: 1,
 }}
 >{arrow}</button>
 ))}
 </div>
 )}
 </div>

 {pick === 'years' && (
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', maxHeight: '260px', overflowY: 'auto' }}>
 {Array.from({ length: 51 }, (_, i) => (maxDate ? maxDate.getFullYear() : today.getFullYear()) - i).map(y => (
 <button key={y} type="button" onClick={() => { setView(v => ({ ...v, year: y })); setPick('months') }}
 style={{ padding: '9px 0', borderRadius: 'var(--radius-control)', border: y === view.year ? '1px solid color-mix(in srgb, var(--text) 50%, transparent)' : 'none', background: y === view.year ? 'color-mix(in srgb, var(--text) 18%, transparent)' : 'rgba(255,255,255,.05)', color: y === view.year ? s.accent : s.text, fontSize: '14px', fontWeight: y === view.year ? 500 : 400, cursor: 'pointer', fontFamily: 'inherit' }}>{y}</button>
 ))}
 </div>
 )}
 {pick === 'months' && (
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
 {MONTH_NAMES.map((m, mi) => {
 const off = maxDate ? new Date(view.year, mi, 1) > maxDate : false
 return (
 <button key={m} type="button" disabled={off} onClick={() => { setView(v => ({ ...v, month: mi })); setPick('days') }}
 style={{ padding: '10px 0', borderRadius: 'var(--radius-control)', border: mi === view.month ? '1px solid color-mix(in srgb, var(--text) 50%, transparent)' : 'none', background: mi === view.month ? 'color-mix(in srgb, var(--text) 18%, transparent)' : 'rgba(255,255,255,.05)', color: off ? 'rgba(255,255,255,.18)' : mi === view.month ? s.accent : s.text, fontSize: '14px', fontWeight: mi === view.month ? 500 : 400, cursor: off ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>{m.slice(0, 3)}</button>
 )
 })}
 </div>
 )}

 {pick === 'days' && (<>
 {/* Day-of-week headers */}
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '6px' }}>
 {DAY_LABELS.map(d => (
 <div key={d} style={{ textAlign: 'center', fontSize: '14px', fontWeight: 500, color: s.muted, letterSpacing: '.04em' }}>{d}</div>
 ))}
 </div>

 {/* Day cells */}
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
 {cells.map((day, i) => {
 if (!day) return <div key={i} />
 const dateStr = `${view.year}-${String(view.month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
 const disabled = maxDate ? new Date(dateStr) > maxDate : false
 const isSelected = dateStr === value
 const isToday = dateStr === today.toISOString().slice(0, 10)
 return (
 <button
 key={i}
 type="button"
 disabled={disabled}
 onClick={() => { onChange(dateStr) }}
 style={{
 padding: '8px 2px', borderRadius: 'var(--radius-control)', border: isToday && !isSelected ? '1px solid color-mix(in srgb, var(--text) 30%, transparent)' : 'none',
 background: isSelected ? 'color-mix(in srgb, var(--text) 22%, transparent)' : 'transparent',
 color: disabled ? 'rgba(255,255,255,.18)' : isSelected ? s.accent : s.text,
 fontSize: '14px', fontWeight: isSelected ? 500 : 400,
 cursor: disabled ? 'not-allowed' : 'pointer',
 textAlign: 'center', fontFamily: 'inherit',
 }}
 >{day}</button>
 )
 })}
 </div>

 </>)}

 {/* Clear / Today footer */}
 {pick === 'days' && value && (
 <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', borderTop: '1px solid rgba(255,255,255,.07)', paddingTop: '10px' }}>
 <button type="button" onClick={() => onChange('')} style={{ background: 'none', border: 'none', color: s.accent, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
 Clear
 </button>
 <button type="button" onClick={() => {
 const t = today.toISOString().slice(0, 10)
 onChange(t)
 setView({ year: today.getFullYear(), month: today.getMonth() })
 }} style={{ background: 'none', border: 'none', color: s.accent, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
 Today
 </button>
 </div>
 )}
 </div>
 )
}
