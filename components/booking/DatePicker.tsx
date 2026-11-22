'use client'

import React, { useState } from 'react'
import { s } from '@/components/pages/_shared'

/**
 * Einfacher Kalender im Look der Buchungs-Picker (kein nativer Browser-Date-Input).
 * Für Daten ohne Verfügbarkeitslogik — z. B. „Datum des letzten Tauchgangs".
 */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function DatePicker({ value, onChange, min, max }: {
  value: string | null
  onChange: (date: string | null) => void
  /** YYYY-MM-DD, inklusive */
  min?: string
  /** YYYY-MM-DD, inklusive */
  max?: string
}) {
  const [cursor, setCursor] = useState(() => {
    // Startmonat: gewählter Tag, sonst max (Vergangenheit, z. B. letzter Tauchgang) bzw. min (Zukunft, z. B. letzter Tag auf der Insel)
    const base = value ? new Date(value + 'T12:00:00') : max ? new Date(max + 'T12:00:00') : min ? new Date(min + 'T12:00:00') : new Date()
    base.setDate(1); return base
  })
  const [yearOpen, setYearOpen] = useState(false)
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const firstWeekday = (monthStart.getDay() + 6) % 7
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const thisYear = new Date().getFullYear()
  // Nur Untergrenze (Zukunftsdatum): Jahre ab min vorwärts; sonst rückwärts (Vergangenheitsdaten)
  const years = min && !max
    ? Array.from({ length: 4 }, (_, i) => Number(min.slice(0, 4)) + i)
    : Array.from({ length: 60 }, (_, i) => thisYear - i)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '8px' }}>
        <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} style={navBtn}>‹</button>
        <button type="button" onClick={() => setYearOpen(o => !o)} style={{ background: 'transparent', border: 'none', color: s.text, fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
          {MONTHS[cursor.getMonth()]} {cursor.getFullYear()} ▾
        </button>
        <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} style={navBtn}>›</button>
      </div>
      {yearOpen && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', marginBottom: '10px', maxHeight: '150px', overflowY: 'auto' }}>
          {years.map(y => (
            <button key={y} type="button" onClick={() => { setCursor(new Date(y, cursor.getMonth(), 1)); setYearOpen(false) }}
              style={{ padding: '6px 0', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer',
                border: `1px solid ${y === cursor.getFullYear() ? 'rgba(53,208,255,.6)' : 'rgba(255,255,255,.08)'}`,
                background: y === cursor.getFullYear() ? 'rgba(53,208,255,.2)' : 'transparent', color: s.text }}>{y}</button>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
        {WEEKDAYS.map(w => <div key={w} style={{ textAlign: 'center', fontSize: '10px', color: s.muted, fontWeight: 700 }}>{w}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {Array.from({ length: firstWeekday }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const d = ymd(new Date(cursor.getFullYear(), cursor.getMonth(), i + 1))
          const disabled = (min ? d < min : false) || (max ? d > max : false)
          const isSel = value === d
          return (
            // Der gewählte Tag bleibt immer anklickbar (abwählen), auch wenn er inzwischen ausserhalb von min/max liegt
            <button key={d} type="button" disabled={disabled && !isSel} title={disabled && isSel ? 'Click to clear' : undefined} onClick={() => onChange(isSel ? null : d)}
              style={{
                padding: '9px 0', borderRadius: '8px', fontFamily: 'inherit', fontSize: '13px', fontWeight: isSel ? 800 : 600,
                border: `1px solid ${isSel ? 'rgba(53,208,255,.7)' : 'rgba(255,255,255,.08)'}`,
                background: isSel ? 'rgba(53,208,255,.25)' : 'transparent',
                color: disabled ? 'rgba(255,255,255,.18)' : s.text, cursor: disabled ? 'not-allowed' : 'pointer',
              }}>{i + 1}</button>
          )
        })}
      </div>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  width: '32px', height: '32px', borderRadius: '8px', border: '1px solid rgba(255,255,255,.12)', background: 'transparent',
  color: '#cfe2f4', fontSize: '18px', cursor: 'pointer', fontFamily: 'inherit',
}
