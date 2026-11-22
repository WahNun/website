'use client'
import { useState } from 'react'
import { s } from '@/components/pages/_shared'

// Balkendiagramm fuer den Finances-Bereich (Lucas 05.11.2026): Maus ueber einen Balken zeigt ein kleines
// Feld mit den Kernzahlen dieses Balkens. Auf Touch-Geraeten oeffnet ein Tipp das Feld, per Tastatur der Fokus.
// `value2` = Vergleichswert (z. B. Vorjahr): wird als zweiter, grauer Balken links neben dem Hauptbalken gezeichnet.
export type BarPoint = { key: string; label: string; value: number; value2?: number; tip: Array<[string, string]>; dim?: boolean; mark?: boolean }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// Kurzbeschriftung unter einem Balken: Tag = Tageszahl, Monat = Jan..Dec, Jahr = Jahr
const shortLabel = (key: string) => (key.length === 10 ? key.slice(8, 10) : key.length === 7 ? MONTHS[Number(key.slice(5, 7)) - 1] ?? key : key)

// `empty` = Text, wenn es im Zeitraum nichts zu zeichnen gibt; `hint` = Hinweiszeile unter dem Diagramm (nur wenn es sichtbar ist)
// `legend` = Namen fuer [Vergleichsbalken, Hauptbalken], nur bei Diagrammen mit `value2`
// `tone` = Farbe der Balken: nur Markenfarben: Electric Ocean fuer gebuchte Werte (Standard), Reef Teal fuer eingegangenes Geld
const TONES = { blue: { full: '#f3efe6', soft: 'rgba(243,239,230,.5)' }, teal: { full: '#b7c4b0', soft: 'rgba(183,196,176,.5)' } } as const
export default function BarChart({ series, height = 88, empty, hint, legend, tone = 'blue' }: { series: BarPoint[]; height?: number; empty?: string; hint?: string; legend?: [string, string]; tone?: keyof typeof TONES }) {
 const [hover, setHover] = useState<number | null>(null)
 // x = Mitte der Balkenspalte, w = Breite der Balkenreihe (beides in Pixeln, beim Zeigen gemessen)
 const [spot, setSpot] = useState({ x: 0, w: 0 })
 const show = (i: number, el: HTMLElement) => { setSpot({ x: el.offsetLeft + el.offsetWidth / 2, w: el.parentElement?.clientWidth ?? 0 }); setHover(i) }
 if (series.length < 2 || series.every(x => x.value === 0 && !x.value2)) return empty ? <div style={{ fontSize: '14px', color: s.muted, padding: '4px 0 10px' }}>{empty}</div> : null
 const pair = series.some(x => x.value2 !== undefined)
 const col = TONES[tone]
 const PREV = 'rgba(201,194,182,.42)'
 const max = Math.max(1, ...series.map(x => Math.max(Math.abs(x.value), Math.abs(x.value2 ?? 0))))
 const labels = series.length <= 31
 const n = series.length
 const at = hover !== null && hover < n ? series[hover] : null
 // Feld schwebt direkt ueber dem Balken, auf den es sich bezieht (Lucas 05.11.): Mitte = gemessene Mitte der
 // Balkenspalte, Unterkante = knapp ueber der Balkenspitze. Nur am Rand ruecken wir es so weit nach innen, dass es ganz sichtbar bleibt.
 const half = 100
 const cx = Math.min(Math.max(spot.x, Math.min(half, spot.w / 2)), Math.max(spot.w - half, spot.w / 2))
 const top = at ? Math.max(2, Math.max(Math.abs(at.value), Math.abs(at.value2 ?? 0)) / max * height) : 0
 return (
 <div style={{ position: 'relative', marginBottom: '14px' }} onMouseLeave={() => setHover(null)}>
 <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: n > 62 ? '1px' : '3px', height: `${height + (labels ? 22 : 4)}px` }}>
 {at && (
 <div role="status" style={{ position: 'absolute', bottom: `${top + (labels ? 18 : 0) + 8}px`, left: `${cx}px`, transform: 'translateX(-50%)', zIndex: 20, minWidth: '178px', background: '#121210', border: '1px solid rgba(243,239,230,.35)', borderRadius: 0, padding: '9px 12px', boxShadow: 'none', pointerEvents: 'none' }}>
 <div style={{ fontSize: '14px', fontWeight: 800, color: s.text, marginBottom: '6px', whiteSpace: 'nowrap' }}>{at.label}</div>
 {at.tip.map(([l, v]) => (
 <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', fontSize: '14px', lineHeight: '19px', whiteSpace: 'nowrap' }}>
 <span style={{ color: s.muted }}>{l}</span>
 <span style={{ color: s.text, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
 </div>
 ))}
 </div>
 )}
 {series.map((x, i) => {
 const on = hover === i
 const fill = x.value < 0 ? '#c9928c' : x.dim || x.value === 0 ? 'rgba(255,255,255,.07)' : on || x.mark ? col.full : col.soft
 return (
 <div key={x.key} tabIndex={0} aria-label={`${x.label}: ${x.tip.map(([l, v]) => `${l} ${v}`).join(', ')}`}
 onMouseEnter={e => show(i, e.currentTarget)} onFocus={e => show(i, e.currentTarget)} onBlur={() => setHover(h => (h === i ? null : h))} onClick={e => { if (hover === i) setHover(null); else show(i, e.currentTarget) }}
 style={{ flex: '1 1 0', minWidth: '2px', maxWidth: pair ? '72px' : '46px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', outline: 'none', cursor: 'default', background: on ? 'rgba(255,255,255,.04)' : 'transparent', borderRadius: '4px 4px 0 0' }}>
 {pair ? (
 <span style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', padding: '0 3px' }}>
 <span style={{ flex: '1 1 0', height: `${Math.max(2, Math.abs(x.value2 ?? 0) / max * height)}px`, borderRadius: '3px 3px 0 0', background: x.value2 ? PREV : 'rgba(255,255,255,.07)' }} />
 <span style={{ flex: '1 1 0', height: `${Math.max(2, Math.abs(x.value) / max * height)}px`, borderRadius: '3px 3px 0 0', background: fill }} />
 </span>
 ) : (
 <span style={{ display: 'block', height: `${Math.max(2, Math.abs(x.value) / max * height)}px`, borderRadius: '3px 3px 0 0', background: fill }} />
 )}
 {labels && <span style={{ display: 'block', fontSize: '14px', color: on || x.mark ? col.full : s.muted, marginTop: '4px', lineHeight: '14px', textAlign: 'center', overflow: 'hidden' }}>{shortLabel(x.key)}</span>}
 </div>
 )
 })}
 </div>
 {pair && legend && (
 <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: s.muted, marginTop: '8px' }}>
 <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: 0, background: PREV, marginRight: '6px' }} />{legend[0]}</span>
 <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: 0, background: col.full, marginRight: '6px' }} />{legend[1]}</span>
 </div>
 )}
 {hint && <div style={{ fontSize: '14px', color: s.muted, marginTop: '8px' }}>{hint}</div>}
 </div>
 )
}
