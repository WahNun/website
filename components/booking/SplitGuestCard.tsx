'use client'

import { closePicker, scrollBelowHeader } from '@/lib/scrollBack'
import React, { useEffect, useRef, useState } from 'react'
import { s } from '@/components/pages/_shared'
import SessionPicker, { type Picked } from '@/components/booking/SessionPicker'
import CourseStartPicker from '@/components/booking/CourseStartPicker'
import { isNightProduct } from '@/lib/availability'
import DatePicker from '@/components/booking/DatePicker'
import { insuranceCostCents, needsRefresher } from '@/lib/insurance'
import { asksLastDive, isSkillsUpdate, isProgramProduct, REFRESHER_PRODUCT_ID } from '@/lib/productType'

/**
 * Online-Split (Lucas 24.10.): eine Karte pro Person im /book-Formular — eigenes Produkt, eigene Tage,
 * eigener letzter Tauchgang ( ggf. eigener Scuba Skills Update), eigene Miete, eigene Versicherung.
 * Die Karte rechnet nur zur Anzeige; der Server validiert und bepreist jede Position erneut (lib/checkoutGuest.ts).
 */

export type Price = { id: string; name: string; price_cents: number; category: string; sessions_included: number | null; duration_days_min: number | null; boat_days: number | null; request_only: boolean; equipment_included?: boolean; computer_included?: boolean; insurance_included?: boolean }
export type AddonPrice = { id: string; name: string; price_cents: number; category: string; addon_scope: string }

export type GuestSpec = {
 product_id: string
 product_name: string
 sessions: Picked[]
 last_dive_date: string | null
 refresher_date: string | null
 refresher_count: number
 addons: { product_id: string; quantity: number }[]
 insurance_requested: boolean
 insurance_choice: 'azd' | 'own' | null
 /** Anzeige-Summe in Cent (Server rechnet selbst) */
 total_cents: number
 /** Alles gewählt, was der Checkout braucht */
 ready: boolean
 /** Warum nicht ready — Text für den Pay-Button */
 missing: string | null
 /** Zusatzprodukt derselben Person: Server rechnet kein zweites Scuba Skills Update */
 skip_refresher?: boolean
 /** Karte hat die Equipment-Frage gestellt (Zusatzkarten derselben Person übernehmen die Wahl) */
 equipment_asked?: boolean
 /** Versicherung im Produkt enthalten (z. B. SSI-Kurs) — Tage sind darüber gedeckt */
 insurance_included?: boolean
 lines: { label: string; cents: number }[]
}

/** Tauchgänge pro gebuchter Session: Single Dive / Night Dive = 1, alles andere (Double Dive, Packs, Ausflüge) = 2 */
export const divesPerSession = (productId: string | undefined | null) => (productId === 'single-dive' || productId === 'night-dive' ? 1 : 2)
export const MAX_DIVES_PER_DAY = 3

const COURSE_CATS = ['entry', 'specialty', 'ecology', 'pro']
const EXTRA_IDS = new Set(['rental-torch', 'rental-tank-15l', 'rental-gloves'])
const EXTRA_NAMES = ['torch', '15l tank', 'gloves']
const POPULAR_META: Record<string, { icon: string; text: string }> = {
 'rental-torch': { icon: '', text: 'See what others miss in cracks and caves' },
 'rental-tank-15l': { icon: '', text: 'Extra air reserve for heavier breathers — dives end at 50 bar or 50 minutes, whichever comes first' },
 'rental-gloves': { icon: '', text: 'Keep your hands warm' },
}

export default function SplitGuestCard(p: {
 index: number
 total: number
 /** Buchungsfenster (/book): Grund, wenn ein Tag/eine Schicht für dieses Produkt online gesperrt ist */
 windowBlocked?: (date: string, session: string, productId: string) => string | null
 /** Low Season: Tag liegt in einem Anfrage-Fenster fehlender Instructor im Dienstplan sperrt nicht */
 windowRequest?: (date: string, productId: string) => boolean
 prices: Price[]
 groupedEntries: ReadonlyArray<readonly [string, Price[]]>
 categoryLabel: Record<string, string>
 equipmentAddons: AddonPrice[]
 refresherProduct: { id: string; name: string; price_cents: number } | null
 initialProductId: string
 initialLastDive?: string
 /** Beim Wechsel von der Einzelbuchung in die Kartenansicht: schon gewählte Tage, SSU-Datum, Equipment und Versicherung übernehmen */
 initial?: { picked: Picked[]; courseStart: { date: string } | null; refresherDate: string; addonIds: string[]; insuranceChoice: '' | 'own' | 'auto'; collapsed: boolean }
 /** Zusatzprodukt für dieselbe Person (Nummer 1-basiert): kein eigenes SSU, Tage erst nach dem SSU der ersten Buchung */
 extraOf?: number
 inheritLastDive?: string | null
 notBeforeDate?: string | null
 /** Zusatzprodukt: Equipment-Wahl der ersten Karte (Produkt-IDs); null = Frage neu stellen */
 inheritAddonIds?: string[] | null
 /** Zusatzprodukt: Versicherungs-Wahl der ersten Karte; null = Frage neu stellen */
 inheritInsurance?: 'own' | 'auto' | null
 /** Gewählte Tauchtage derselben Person in ihren anderen Karten (für das Tageslimit) */
 samePersonPicks?: { date: string; dives: number }[]
 /** Frühere Karten derselben Person (Reihenfolge): Tage, Equipment und DAN-Tage, die dort schon bezahlt werden */
 /** Spätere Karten derselben Person: die DAN-Gesamtsumme wird einmal über alle Tage der Person gerechnet (günstigster Plan je Block) und der ersten DAN-Karte zugeordnet */
 laterCards?: { dates: string[]; insuranceAzd: boolean; insuranceCovered: boolean; refresherDate: string | null }[]
 earlierCards?: { dates: string[]; addonIds: string[]; insuranceAzd: boolean; insuranceCovered: boolean; refresherDate: string | null }[]
 onRemove?: () => void
 /** Anfrage-Modus, Gast 2+: Vor-/Nachname wird in der Karte über dem Produkt abgefragt (der Server verlangt sie für jeden Gast) */
 nameField?: { first: string; last: string; onChange: (first: string, last: string) => void }
 onChange: (spec: GuestSpec) => void
}) {
 const { index, prices, equipmentAddons, refresherProduct } = p
 const [productId, setProductId] = useState(p.initialProductId)
 const [pickedDives, setPicked] = useState<Picked[]>(p.initial?.picked ?? [])
 const [courseStart, setCourseStart] = useState<{ date: string } | null>(p.initial?.courseStart ?? null)
 const [lastDiveOwn, setLastDive] = useState(p.initialLastDive ?? '')
 // Zusatzprodukt: letzter Tauchgang kommt aus der ersten Buchung dieser Person (kein zweites SSU)
 const inherited = p.extraOf ? (p.inheritLastDive ?? null) : null
 const lastDive = inherited ?? lastDiveOwn
 const [refresherDateRaw, setRefresherDate] = useState(p.initial?.refresherDate ?? '')
 const [selectedAddonIds, setSelectedAddonIds] = useState<Set<string>>(new Set(p.initial?.addonIds ?? []))
 const [equipOverride, setEquipOverride] = useState(false)
 const [insOverride, setInsOverride] = useState(false)
 const [insuranceChoice, setInsuranceChoice] = useState<'' | 'own' | 'auto'>(p.initial?.insuranceChoice ?? '')
 const [collapsed, setCollapsed] = useState(p.initial?.collapsed ?? false)
 const [openPicker, setOpenPicker] = useState<'refresher' | 'product' | 'lastdive' | null>(null)
 // Bei Scuba Skills Update: Produkt-Dropdown + Tauchtage gehören zusammen — beim Öffnen der Tage steht das Dropdown oben im Viewport
 const prodSelRef = useRef<HTMLDivElement | null>(null)

 // Mobile: geöffneten Picker komplett in den Viewport holen (sonst muss man nach „Select dates“ erst selbst runterscrollen)
 useEffect(() => {
 if (!openPicker) return
 const t = setTimeout(() => {
 try { scrollBelowHeader((openPicker === 'product' && prodSelRef.current ? prodSelRef.current : document.querySelector('[data-pickrow][data-open="1"]')) as HTMLElement | null) } catch (e) { console.warn('[picker] scroll failed', e) }
 }, 80)
 return () => clearTimeout(t)
 }, [openPicker])
 const [todayStr] = useState(() => new Date().toISOString().slice(0, 10))

 const product = prices.find(x => x.id === productId)
 const isCourse = COURSE_CATS.includes(product?.category ?? '')
 const required = isCourse ? (product?.duration_days_min ?? 1) : (product?.sessions_included ?? 1)
 const requestOnly = Boolean(product?.request_only)

 // Kurs: Startdatum N aufeinanderfolgende Tage ohne AM/PM (abgeleitet, kein State)
 const picked: Picked[] = (() => {
 if (!isCourse) return pickedDives
 if (!courseStart) return []
 const out: Picked[] = []
 const base = new Date(courseStart.date + 'T12:00:00')
 for (let i = 0; i < required; i++) { const d = new Date(base); d.setDate(d.getDate() + i); out.push({ date: d.toISOString().slice(0, 10), session: 'tbd' }) }
 return out
 })()

 const lastDiveRequired = asksLastDive(product?.name, product?.category)
 // Spätester gebuchter Tauchtag zählt (Lucas 25.10.: > 12 Monate nicht im Wasser = Refresher, egal für wann)
 const [stickyLatestDive, setStickyLatestDive] = useState('')
 const latestPicked = picked.length > 0 ? [...picked].map(x => x.date).sort().slice(-1)[0] : ''
 useEffect(() => { if (latestPicked) setStickyLatestDive(latestPicked) }, [latestPicked])
 const refresherRef = latestPicked || stickyLatestDive || (refresherDateRaw || null)
 const refresherCount = lastDiveRequired && !isSkillsUpdate(product?.name) && !inherited && lastDive && needsRefresher(lastDive, refresherRef) ? 1 : 0
 const refresherDate = refresherCount > 0 ? refresherDateRaw : ''
 const earliest = refresherCount > 0 && refresherDate ? refresherDate : (p.extraOf ? (p.notBeforeDate ?? null) : null)

 const diveDays = Math.max(1, new Set(picked.map(x => x.date)).size)
 const equipmentIncluded = Boolean(product?.equipment_included)
 const insuranceIncluded = Boolean(product?.insurance_included)
 const fullEquipAddon = equipmentAddons.find(a => a.id === 'rental-full-double') ?? equipmentAddons.find(a => /full.?equip/i.test(a.name))
 const isEntryCourse = product?.category === 'entry'
 // Einsteigerkurse: keine Miet-/Extra-Auswahl (Lucas 24.10.)
 const visibleAddons = equipmentAddons.filter(a => {
 if (isEntryCourse) return false
 if (!equipmentIncluded) return true
 const n = a.name.toLowerCase()
 return EXTRA_NAMES.some(x => n.includes(x)) || (n.includes('computer') && !product?.computer_included)
 })
 // Zusatzprodukt derselben Person: Equipment-Wahl der ersten Karte übernehmen, nicht erneut fragen
 const inheritEquip = Boolean(p.extraOf) && p.inheritAddonIds != null && !equipOverride && !equipmentIncluded && !isEntryCourse
 const inheritKey = (p.inheritAddonIds ?? []).slice().sort().join('|')
 useEffect(() => {
 if (inheritEquip) setSelectedAddonIds(new Set(p.inheritAddonIds ?? []))
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [inheritEquip, inheritKey])
 const fullSelected = Boolean(fullEquipAddon && selectedAddonIds.has(fullEquipAddon.id))
 const popular = visibleAddons.filter(a => EXTRA_IDS.has(a.id))
 const singles = visibleAddons.filter(a => a.id !== fullEquipAddon?.id && !EXTRA_IDS.has(a.id))
 const insurancePlans = prices.filter(x => x.category === 'insurance')
 // Versicherung deckt auch den Tag des Scuba Skills Update ab (Wassertag)
 const allInsDates = [...new Set([...picked.map(x => x.date), ...(refresherDate ? [refresherDate] : [])])]
 // Equipment je Teil nur für Tage, die eine frühere Karte derselben Person nicht schon mit demselben Teil abdeckt
 const ownDays = [...new Set(picked.map(x => x.date))]
 const addonQty = (id: string) => ownDays.length === 0 ? 1 : ownDays.filter(d => !(p.earlierCards ?? []).some(c => c.addonIds.includes(id) && c.dates.includes(d))).length
 const insPriceOf = (planId: string) => insurancePlans.find(x => x.id === planId)?.price_cents ?? 0
 // DAN einmal über ALLE Tage der Person (alle Karten, die DAN wählen), günstigster Plan je zusammenhängendem Block.
 // Die Summe steht auf der ersten DAN-Karte der Person; spätere Karten zeigen 0 (Reihenfolge der Eingabe egal).
 // Tage, die ein SSI-Produkt der Person (Versicherung enthalten) deckt, brauchen kein DAN.
 const others = [...(p.earlierCards ?? []), ...(p.laterCards ?? [])]
 const ssiCovered = new Set(others.filter(c => c.insuranceCovered).flatMap(c => c.dates))
 const firstAzdCard = !(p.earlierCards ?? []).some(c => c.insuranceAzd)
 const personDates = [...new Set([
 ...allInsDates,
 ...(p.laterCards ?? []).filter(c => c.insuranceAzd).flatMap(c => [...c.dates, ...(c.refresherDate ? [c.refresherDate] : [])]),
 ])].filter(d => !ssiCovered.has(d))
 const insurancePerDiver = insuranceChoice === 'auto' && !insuranceIncluded && firstAzdCard && personDates.length > 0
 ? insuranceCostCents(personDates, insPriceOf)
 : 0
 const firstDiveDate = picked.length > 0 ? [...picked].map(x => x.date).sort()[0] : null
 const daysLocked = refresherCount > 0 && !refresherDate
 const refresherReady = refresherCount === 0 || (Boolean(refresherDate) && (!firstDiveDate || refresherDate < firstDiveDate))
 const inheritIns = Boolean(p.extraOf) && Boolean(p.inheritInsurance) && !insOverride && !insuranceIncluded
 useEffect(() => {
 if (inheritIns && p.inheritInsurance) setInsuranceChoice(p.inheritInsurance)
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [inheritIns, p.inheritInsurance])
 const insAllCovered = allInsDates.length > 0 && (!firstAzdCard || allInsDates.every(d => ssiCovered.has(d)))
 const insuranceReady = insuranceIncluded || insuranceChoice === 'own' || (insuranceChoice === 'auto' && (insurancePerDiver > 0 || insAllCovered))
 const lastDiveReady = !lastDiveRequired || /^\d{4}-\d{2}-\d{2}$/.test(lastDive)

 const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
 // Letzter Tauchgang liegt in der Vergangenheit Jahr gehört dazu
 const fmtDayY = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })

 const nameMissing = Boolean(p.nameField) && !(p.nameField!.first.trim() && p.nameField!.last.trim())
 const missing: string | null = nameMissing ? 'first and last name' : !product ? null : requestOnly ? `${product.name} is on request only`
 : picked.length < required ? (isCourse ? 'start date' : `${required - picked.length} more dive day${required - picked.length === 1 ? '' : 's'}`)
 : !lastDiveReady ? 'date of last dive'
 : !refresherReady ? 'Scuba Skills Update date'
 : !insuranceReady ? 'insurance option'
 : null
 const cardTotal = product ? product.price_cents + (refresherCount > 0 && refresherProduct ? refresherProduct.price_cents : 0) + insurancePerDiver + [...selectedAddonIds].reduce((a, id) => a + ((equipmentAddons.find(x => x.id === id)?.price_cents ?? 0) * addonQty(id)), 0) : 0

 // Alle Posten dieser Karte (auch für die eingeklappte Ansicht)
 const lineItems: { label: string; cents: number }[] = product ? (() => {
 const out: { label: string; cents: number }[] = [{ label: product.name, cents: product.price_cents }]
 if (refresherCount > 0 && refresherProduct) out.push({ label: ` ${refresherProduct.name}`, cents: refresherProduct.price_cents })
 if (insurancePerDiver > 0) out.push({ label: (p.laterCards ?? []).some(c => c.insuranceAzd) ? 'DAN Insurance (all your days)' : 'DAN Insurance', cents: insurancePerDiver })
 for (const id of selectedAddonIds) {
 const q = addonQty(id); const ad = equipmentAddons.find(x => x.id === id)
 if (ad && q > 0) out.push({ label: `${ad.name} × ${q}`, cents: ad.price_cents * q })
 }
 return out
 })() : []

 // Spec nach oben melden
 useEffect(() => {
 if (!product) return
 const lines = lineItems
 const addons = [...selectedAddonIds].map(id => ({ product_id: id, quantity: addonQty(id) })).filter(a => a.quantity > 0)
 const total = lines.reduce((a, l) => a + l.cents, 0)
 p.onChange({
 product_id: product.id, product_name: product.name, sessions: picked,
 last_dive_date: lastDiveRequired ? (lastDive || null) : null,
 refresher_date: refresherCount > 0 ? (refresherDate || null) : null, refresher_count: refresherCount,
 addons, insurance_requested: !insuranceIncluded && insuranceChoice === 'auto' && insurancePerDiver > 0,
 insurance_choice: insuranceIncluded ? null : (insuranceChoice === 'auto' ? 'azd' : insuranceChoice === 'own' ? 'own' : null),
 total_cents: total, ready: missing === null, missing, lines,
 ...(inherited ? { skip_refresher: true } : {}),
 insurance_included: insuranceIncluded,
 equipment_asked: !isEntryCourse && !equipmentIncluded && equipmentAddons.length > 0,
 })
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [productId, picked, lastDive, refresherDate, selectedAddonIds, insuranceChoice, insurancePerDiver, diveDays, refresherCount, p.earlierCards])

 function toggleAddon(id: string) {
 setSelectedAddonIds(prev => {
 const next = new Set(prev)
 if (next.has(id)) next.delete(id); else next.add(id)
 if (fullEquipAddon && id === fullEquipAddon.id && next.has(id)) for (const x of [...next]) if (x !== id && !EXTRA_IDS.has(x)) next.delete(x)
 return next
 })
 }

 const field: React.CSSProperties = { width: '100%', background: 'var(--bg)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 'var(--radius-card)', padding: '10px 12px', fontSize: '15px', color: s.text, fontFamily: s.font, outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' }
 const small: React.CSSProperties = { fontSize: '14px', color: s.muted, marginTop: '2px', lineHeight: 1.5 }
 const pickBtn = (done: boolean): React.CSSProperties => ({ padding: '7px 12px', borderRadius: 'var(--radius-control)', fontSize: '14px', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', border: `1px solid ${done ? 'rgba(255,255,255,.15)' : 'color-mix(in srgb, var(--text) 50%, transparent)'}`, background: done ? 'transparent' : 'color-mix(in srgb, var(--text) 15%, transparent)', color: done ? s.sub : 'var(--accent)', whiteSpace: 'nowrap' })
 const row = (open: boolean, done: boolean): React.CSSProperties => ({ border: `1px solid ${open ? 'color-mix(in srgb, var(--text) 50%, transparent)' : done ? 'var(--text)' : 'var(--text)'}`, background: open ? 'color-mix(in srgb, var(--text) 6%, transparent)' : 'rgba(255,255,255,.03)', borderRadius: 'var(--radius-card)', padding: '10px 12px', marginTop: '8px' })
 const opt = (active: boolean, disabled = false): React.CSSProperties => ({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', padding: '9px 11px', borderRadius: 'var(--radius-control)', border: `1px solid ${active ? 'color-mix(in srgb, var(--text) 50%, transparent)' : 'rgba(255,255,255,.1)'}`, background: active ? 'color-mix(in srgb, var(--text) 10%, transparent)' : 'transparent', color: active ? 'var(--text)' : 'var(--accent)', fontWeight: active ? 500 : 400, fontSize: '14px', cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit', opacity: disabled ? .45 : 1 })
 const doneBtn = (ok: boolean, txt: string, next?: () => void) => (
 <button type="button" onClick={e => (ok && next) ? next() : closePicker(e, () => setOpenPicker(null))} style={{ width: '100%', marginTop: '10px', padding: '10px', borderRadius: 'var(--radius-control)', border: 'none', background: ok ? s.accent : 'rgba(255,255,255,.08)', color: ok ? 'var(--bg)' : s.muted, fontWeight: 500, fontSize: '14px', fontFamily: 'inherit', cursor: 'pointer' }}>{txt}</button>
 )

 const titleLabel = p.extraOf ? (p.total === 1 ? 'Additional product' : `Guest ${p.extraOf} — additional product`) : (p.total === 1 ? 'Your first product' : `Guest ${index + 1} of ${p.total}`)
 if (collapsed && product) {
 const dates = [refresherDate ? ` ${fmtDay(refresherDate)}` : '', ...picked.map(x => `${fmtDay(x.date)}${x.session !== 'tbd' ? ` ${x.session.toUpperCase()}` : ''}`)].filter(Boolean).join(' · ')
 return (
 <div data-guestcard data-done style={{ scrollMarginTop: '88px', border: `1px solid ${missing ? 'var(--line)' : 'var(--line)'}`, borderRadius: 'var(--radius-card)', padding: '12px 16px', marginBottom: '14px', background: 'var(--glass)' }}>
 <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
 <div style={{ minWidth: 0 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.accent }}>{titleLabel}</div>
 <div style={{ fontSize: '14.5px', fontWeight: 500, color: s.text, marginTop: '2px' }}>{product.name}</div>
 {dates && <div style={{ ...small, marginTop: '2px' }}>{dates}</div>}
 {/* Alle Posten einzeln: Produkt, Scuba Skills Update, Equipment, DAN … */}
 <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
 {lineItems.map((l, i) => (
 <div key={i} style={{ ...small, marginTop: 0, display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
 <span>{l.label}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>€{(l.cents / 100).toFixed(2)}</span>
 </div>
 ))}
 {inheritIns && <div style={{ ...small, marginTop: 0 }}> Insurance as for your first product</div>}
 </div>
 {missing && <div style={{ ...small, color: 'var(--text)' }}> Still needed: {missing}</div>}
 </div>
 <div style={{ textAlign: 'right', flexShrink: 0 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.sub, fontVariantNumeric: 'tabular-nums' }}>€{(cardTotal / 100).toFixed(2)}</div>
 <button type="button" onClick={() => setCollapsed(false)} style={{ background: 'none', border: 'none', padding: 0, marginTop: '4px', color: s.accent, fontSize: '14px', fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>Edit</button>
 </div>
 </div>
 </div>
 )
 }

 const requestHint = (
 <div style={{ ...small, color: 'var(--text)', marginTop: '8px' }}>{product?.name} runs on request — <a href="/contact" style={{ color: s.accent }}>send an enquiry</a> or pick another product for this guest.</div>
 )

 const productSelect = (
 <select value={productId} onChange={e => { setProductId(e.target.value); setPicked([]); setCourseStart(null); setSelectedAddonIds(new Set()); setOpenPicker(null) }} style={field}>
 {p.groupedEntries.map(([cat, allRows]) => {
 // Divemaster / Dive Guide nur als eigene Anfrage über das Hauptformular, nicht in getrennten Buchungen
 const rows = allRows.filter(x => !isProgramProduct(x.id))
 return rows.length === 0 ? null : (
 <optgroup key={cat} label={p.categoryLabel[cat] ?? cat}>
 {rows.map(x => <option key={x.id} value={x.id}>{x.name} — €{(x.price_cents / 100).toFixed(0)}</option>)}
 </optgroup>
 )
 })}
 </select>
 )

 return (
 <div data-guestcard style={{ scrollMarginTop: '88px', border: '1px solid color-mix(in srgb, var(--text) 25%, transparent)', borderRadius: 'var(--radius-card)', padding: '14px 16px', marginBottom: '14px', background: 'var(--glass)' }}>
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.accent }}>{titleLabel}</div>
 {p.onRemove && <button type="button" onClick={p.onRemove} style={{ background: 'none', border: 'none', color: s.muted, fontSize: '14px', fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'underline', marginLeft: 'auto', marginRight: '12px' }}>Remove</button>}
 {product && <div style={{ fontSize: '14px', fontWeight: 500, color: s.sub, fontVariantNumeric: 'tabular-nums' }}>€{(cardTotal / 100).toFixed(2)}</div>}
 </div>

 {p.nameField && (
 <div style={{ marginBottom: '12px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '6px' }}>Who is diving? *</div>
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
 <input type="text" value={p.nameField.first} onChange={e => p.nameField!.onChange(e.target.value, p.nameField!.last)} placeholder="First name" autoComplete="off" maxLength={40} style={field} data-clarity-mask="true" />
 <input type="text" value={p.nameField.last} onChange={e => p.nameField!.onChange(p.nameField!.first, e.target.value)} placeholder="Last name" autoComplete="off" maxLength={40} style={field} data-clarity-mask="true" />
 </div>
 </div>
 )}
 {refresherCount === 0 && productSelect}

 {requestOnly && refresherCount === 0 && requestHint}
 {(!requestOnly || refresherCount > 0) && (
 <>
 {/* Letzter Tauchgang */}
 {lastDiveRequired && inherited && (
 <div style={{ ...small, color: 'var(--text)', marginTop: '8px' }}> Last dive{p.notBeforeDate ? ' and Scuba Skills Update are' : ' is'} covered by guest {p.extraOf}’s first booking.</div>
 )}
 {lastDiveRequired && !inherited && (
 <div data-pickrow data-open={openPicker === 'lastdive' ? '1' : undefined} style={{ scrollMarginTop: '88px', ...row(openPicker === 'lastdive', Boolean(lastDive)) }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
 <div style={{ flex: 1 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>Date of last dive</div>
 <div style={small}>{lastDive ? `${fmtDayY(lastDive)}${refresherCount > 0 ? ' · Scuba Skills Update required (12+ months)' : ''}` : 'Certified divers only — 12+ months ago adds a Scuba Skills Update'}</div>
 </div>
 <button type="button" onClick={() => setOpenPicker(openPicker === 'lastdive' ? null : 'lastdive')} style={pickBtn(Boolean(lastDive))}>{lastDive ? 'Change' : 'Select date'}</button>
 </div>
 {openPicker === 'lastdive' && (
 <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
 <DatePicker value={lastDive || null} max={todayStr} onChange={v => { setLastDive(v ?? ''); if (v) setOpenPicker(null) }} />
 </div>
 )}
 </div>
 )}

 {/* Scuba Skills Update */}
 {refresherCount > 0 && refresherProduct && (
 <div data-pickrow data-open={openPicker === 'refresher' ? '1' : undefined} style={{ scrollMarginTop: '88px', ...row(openPicker === 'refresher', Boolean(refresherDate)) }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
 <div style={{ flex: 1 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}><span style={{ color: 'var(--text)' }}>Step 1 · </span> {refresherProduct.name} · €{(refresherProduct.price_cents / 100).toFixed(0)}</div>
 <div style={small}>{refresherDate ? `${fmtDay(refresherDate)} · start time confirmed by your instructor` : 'Half-day refresher before this guest’s first dive'}<span style={{ display: 'block', color: 'var(--text)' }}> Full equipment included for this session.</span></div>
 </div>
 <button type="button" onClick={() => setOpenPicker(openPicker === 'refresher' ? null : 'refresher')} style={pickBtn(Boolean(refresherDate))}>{refresherDate ? 'Change date' : 'Select date'}</button>
 </div>
 {openPicker === 'refresher' && (
 <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
 <CourseStartPicker productId={REFRESHER_PRODUCT_ID} days={1} guests={1} boatDays={0} blockedDays={d => p.windowBlocked?.(d, 'tbd', productId) ?? null} requestDay={d => Boolean(p.windowRequest?.(d, productId))} beforeDate={firstDiveDate} value={refresherDate || null} onChange={d => setRefresherDate(d ?? '')} />
 {doneBtn(Boolean(refresherDate), refresherDate ? (!requestOnly && picked.length < required ? 'Confirm — now pick your dive days' : 'Confirm') : 'Pick a date', !requestOnly && picked.length < required ? () => setOpenPicker('product') : undefined)}
 </div>
 )}
 </div>
 )}

 {/* Bei automatischem Scuba Skills Update: Produktwahl erst nach letztem Tauchgang und SSU */}
 {refresherCount > 0 && <div ref={prodSelRef} style={{ marginTop: '10px', scrollMarginTop: '88px' }}>{productSelect}</div>}
 {requestOnly && refresherCount > 0 && requestHint}

 {!requestOnly && (
 <>
 {/* Tage — bei Scuba Skills Update erst nach dessen Datum wählbar (Schritt 2) */}
 <div data-pickrow data-open={openPicker === 'product' ? '1' : undefined} style={{ scrollMarginTop: '88px', ...row(openPicker === 'product', picked.length === required), ...(daysLocked ? { opacity: 0.55, borderColor: 'rgba(255,255,255,.1)' } : {}) }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
 <div style={{ flex: 1 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>{refresherCount > 0 && <span style={{ color: daysLocked ? s.sub : 'var(--accent)' }}>Step 2 · </span>}{isCourse ? 'Course dates' : 'Dive days'}</div>
 <div style={small}>
 {daysLocked
 ? 'Pick your Skills Update date first — your dives come after it'
 : picked.length === 0
 ? (isCourse ? `${required} consecutive day${required === 1 ? '' : 's'} — choose a start date${refresherDate ? ` after ${fmtDay(refresherDate)}` : ''}` : isNightProduct(product) ? `${required} night dive${required === 1 ? '' : 's'} — choose the evening${required === 1 ? '' : 's'}` : `${required} boat session${required === 1 ? '' : 's'} — choose day${required === 1 ? '' : 's'} and AM/PM${refresherDate ? ` after ${fmtDay(refresherDate)}` : ''}`)
 : isCourse ? `${fmtDay(picked[0].date)}${required > 1 ? ` ${fmtDay(picked[picked.length - 1].date)}` : ''} · start time confirmed by your instructor`
 : picked.map(x => `${fmtDay(x.date)} ${x.session.toUpperCase()}`).join(' · ')}
 </div>
 </div>
 <button type="button" disabled={daysLocked} onClick={() => setOpenPicker(openPicker === 'product' ? null : 'product')} style={{ ...pickBtn(picked.length === required), ...(daysLocked ? { cursor: 'not-allowed', opacity: 0.6 } : {}) }}>{picked.length === required ? 'Change' : isCourse ? 'Start date' : 'Select dates'}</button>
 </div>
 {openPicker === 'product' && !daysLocked && (
 <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
 {isCourse
 ? <CourseStartPicker productId={productId} days={required} guests={1} boatDays={product?.boat_days ?? null} afterDate={earliest} blockedDays={d => p.windowBlocked?.(d, 'tbd', productId) ?? null} requestDay={d => Boolean(p.windowRequest?.(d, productId))} onlyYear={(p.samePersonPicks ?? [])[0]?.date.slice(0, 4) ?? null} value={courseStart?.date ?? null} onChange={d => setCourseStart(d ? { date: d } : null)} />
 : <SessionPicker mode={isNightProduct(product) ? 'night' : 'boat'} required={required} seats={1} picked={picked} notBefore={earliest ?? undefined} onChange={next => setPicked(next)}
 blockedSlots={(date, sess) => {
 const win = p.windowBlocked?.(date, sess, productId) ?? null
 if (win) return win
 // Alle Buchungen einer Person im selben Kalenderjahr — ein Check-in gilt für alle ihre Karten
 const years = new Set([...(p.samePersonPicks ?? []).map(x => x.date.slice(0, 4)), ...picked.map(x => x.date.slice(0, 4))])
 if (years.size > 0 && !years.has(date.slice(0, 4))) return `All bookings of one guest must be in the same calendar year (${[...years][0]})`
 const other = (p.samePersonPicks ?? []).filter(x => x.date === date).reduce((a, x) => a + x.dives, 0)
 return other > 0 && other + divesPerSession(product?.id) > MAX_DIVES_PER_DAY
 ? `Max ${MAX_DIVES_PER_DAY} dives per day — you already have ${other} dive${other === 1 ? '' : 's'} booked that day`
 : null
 }} />}
 {doneBtn(picked.length === required, picked.length === required ? 'Confirm' : isCourse ? 'Pick a start date' : `Pick ${required - picked.length} more day${required - picked.length === 1 ? '' : 's'}`)}
 </div>
 )}
 </div>

 {/* Equipment: eine Umschaltzeile, Extras eingeklappt */}
 {isEntryCourse ? (
 <div style={{ ...small, color: 'var(--text)', marginTop: '10px' }}> Full equipment is included in {product?.name}.</div>
 ) : inheritEquip ? (
 <div data-step style={{ scrollMarginTop: '88px', marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
 <div style={{ ...small, color: 'var(--text)' }}>
 Equipment: same as for your first product — {fullSelected ? 'full set' : selectedAddonIds.size > 0 ? `${selectedAddonIds.size} rental piece${selectedAddonIds.size === 1 ? '' : 's'}` : 'you bring your own'}
 </div>
 <button type="button" onClick={() => setEquipOverride(true)} style={{ background: 'transparent', border: 'none', color: s.accent, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Change</button>
 </div>
 ) : equipmentAddons.length > 0 && (() => {
 return (
 <div data-step style={{ scrollMarginTop: '88px', marginTop: '14px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '6px' }}>Equipment{equipmentIncluded ? '' : ` · per day${diveDays > 1 ? ` × ${diveDays} days` : ''}`}</div>
 {equipmentIncluded ? (
 <div style={{ ...small, color: 'var(--text)' }}> Full equipment is included in {product?.name}.</div>
 ) : fullEquipAddon && (
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
 <button type="button" onClick={() => { if (fullSelected) toggleAddon(fullEquipAddon.id) }} style={{ ...opt(!fullSelected), justifyContent: 'flex-start' }}>I bring my own</button>
 <button type="button" onClick={() => { if (!fullSelected) toggleAddon(fullEquipAddon.id) }} style={{ ...opt(fullSelected), flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start', gap: '2px' }}>
 <span> Full set · €{(fullEquipAddon.price_cents / 100).toFixed(0)}/day</span>
 <span style={{ fontSize: '14px', color: s.muted, fontWeight: 400 }}>incl. computer</span>
 </button>
 </div>
 )}
 {/* Popular extras = Upsell sichtbar; Einzelteile eingeklappt (und weg, sobald Full Set gewählt) */}
 {popular.length > 0 && (
 <div style={{ marginTop: '10px', border: '1px solid var(--line)', borderRadius: 'var(--radius-control)', padding: '10px 12px', background: 'transparent' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text)', marginBottom: '8px' }}>Popular extras</div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
 {popular.map(a => (
 <button key={a.id} type="button" onClick={() => toggleAddon(a.id)} style={opt(selectedAddonIds.has(a.id))}>
 <span style={{ display: 'flex', flexDirection: 'column', gap: '1px', textAlign: 'left' }}>
 <span>{POPULAR_META[a.id]?.icon ? `${POPULAR_META[a.id].icon} ` : ''}{a.name}</span>
 {POPULAR_META[a.id] && <span style={{ fontSize: '14px', color: s.muted, fontWeight: 400 }}>{POPULAR_META[a.id].text}</span>}
 </span>
 <span style={{ fontSize: '14px', whiteSpace: 'nowrap' }}>€{(a.price_cents / 100).toFixed(0)}/day</span>
 </button>
 ))}
 </div>
 </div>
 )}
 {singles.length > 0 && !fullSelected && (
 <details open={singles.some(a => selectedAddonIds.has(a.id))} style={{ marginTop: '8px' }}>
 <summary style={{ fontSize: '14px', color: s.accent, cursor: 'pointer', padding: '6px 0' }}>Rent single pieces instead</summary>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
 {singles.map(a => (
 <button key={a.id} type="button" onClick={() => toggleAddon(a.id)} style={opt(selectedAddonIds.has(a.id))}>
 <span>{a.name}</span><span style={{ fontSize: '14px', whiteSpace: 'nowrap' }}>€{(a.price_cents / 100).toFixed(0)}/day</span>
 </button>
 ))}
 </div>
 </details>
 )}
 </div>
 )
 })()}

 {/* Versicherung: zwei klare Optionen nebeneinander */}
 <div data-step style={{ scrollMarginTop: '88px', marginTop: '14px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '6px' }}>Dive insurance</div>
 {insuranceIncluded ? (
 <div style={{ ...small, color: 'var(--text)' }}> Included in {product?.name}.</div>
 ) : inheritIns ? (
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
 <div style={{ ...small, color: 'var(--text)' }}>
 Insurance: {insuranceChoice === 'own' ? 'own diving insurance, as selected in your first product' : insurancePerDiver > 0 ? `DAN as selected in your first product · €${(insurancePerDiver / 100).toFixed(0)}${(p.laterCards ?? []).some(c => c.insuranceAzd) ? ' for all your days' : ''}` : 'DAN as selected in your first product'}
 </div>
 <button type="button" onClick={() => setInsOverride(true)} style={{ background: 'transparent', border: 'none', color: s.accent, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Change</button>
 </div>
 ) : (
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
 <button type="button" onClick={() => setInsuranceChoice('auto')} style={{ ...opt(insuranceChoice === 'auto'), flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start', gap: '2px' }}>
 <span> I need diving insurance</span>
 <span style={{ fontSize: '14px', color: insurancePerDiver > 0 ? s.accent : s.muted, fontWeight: insurancePerDiver > 0 ? 500 : 400 }}>{insurancePerDiver > 0 ? `DAN · €${(insurancePerDiver / 100).toFixed(2)}${(p.laterCards ?? []).some(c => c.insuranceAzd) ? ' (all your days)' : ''}` : !firstAzdCard && picked.length ? 'DAN · in your first package' : picked.length ? 'DAN day cover' : 'DAN · pick dates first'}</span>
 </button>
 <button type="button" onClick={() => setInsuranceChoice('own')} style={{ ...opt(insuranceChoice === 'own'), flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start', gap: '2px' }}>
 <span> I have my own diving insurance</span>
 <span style={{ fontSize: '14px', color: s.muted, fontWeight: 400 }}>Policy required at check-in</span>
 </button>
 </div>
 )}
 </div>

 <button type="button" disabled={Boolean(missing)} onClick={e => {
 // Fertig: Karte klappt zu, dann beginnt der Viewport oben bei der nächsten Gast-Karte (Produkt-Auswahl), nicht mitten im Equipment
 const me = (e.currentTarget as HTMLElement).closest('[data-guestcard]') as HTMLElement | null
 setCollapsed(true)
 setTimeout(() => {
 try {
 if (!me) return
 // Nächste noch offene Gast-Karte; sind alle fertig, steht „+ Add another product“ des untersten Gasts oben im Viewport (danach Summe, Zahlung)
 const open = Array.from(document.querySelectorAll<HTMLElement>('[data-guestcard]:not([data-done])')).filter(el => el !== me)
 const after = open.find(el => (me.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) ?? open[0]
 const adds = Array.from(document.querySelectorAll<HTMLElement>('[data-addproduct]'))
 // Nächster Gast: „+ Add another product“ des Vorgängers bleibt oben sichtbar, direkt darunter beginnt der nächste Gast
 const addBefore = after ? adds.filter(el => (after.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) !== 0).pop() : undefined
 const target = after ? (addBefore ?? after) : adds[adds.length - 1]
 scrollBelowHeader(target)
 } catch (err) { console.warn('[card] scroll to next guest failed', err) }
 }, 80)
 }}
 style={{ width: '100%', marginTop: '14px', padding: '11px', borderRadius: 'var(--radius-control)', border: 'none', background: missing ? 'rgba(255,255,255,.08)' : s.accent, color: missing ? s.muted : 'var(--bg)', fontWeight: 500, fontSize: '14px', fontFamily: 'inherit', cursor: missing ? 'default' : 'pointer' }}>
 {missing ? `Still needed: ${missing}` : 'Done'}
 </button>
 </>
 )}
 </>
 )}
 </div>
 )
}
