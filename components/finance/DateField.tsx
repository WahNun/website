'use client'
import { useState } from 'react'
import MiniDatePicker from '@/components/booking/MiniDatePicker'
import { s } from '@/components/pages/_shared'

// Datumsfeld im Finances-Bereich: zeigt DD.MM.YYYY und oeffnet den Kalender aus dem Checkout (MiniDatePicker)
// statt des Browser-eigenen Datumsfelds (Lucas 05.11.2026: gebrandeter Day Picker).
export default function DateField({ value, onChange, max, label }: { value: string; onChange: (ymd: string) => void; max?: string; label: string }) {
 const [open, setOpen] = useState(false)
 const shown = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}` : 'Pick a date'
 return (
 <span style={{ position: 'relative', display: 'inline-block' }}>
 <button type="button" onClick={() => setOpen(o => !o)} aria-label={`${label}: ${shown}`} aria-expanded={open}
 style={{ background: '#000', border: `1px solid ${open ? 'rgba(243,239,230,.5)' : 'rgba(255,255,255,.12)'}`, borderRadius: 0, color: s.text, fontSize: '14px', fontWeight: 500, fontFamily: 'inherit', padding: '7px 11px', cursor: 'pointer', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
 {shown}
 </button>
 {open && (
 <>
 <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 190 }} />
 {/* Leere Auswahl ("Clear") aendert hier nichts: ein Zeitraum braucht immer ein Datum */}
 <MiniDatePicker value={value} max={max} onChange={v => { if (v) onChange(v); setOpen(false) }} />
 </>
 )}
 </span>
 )
}
