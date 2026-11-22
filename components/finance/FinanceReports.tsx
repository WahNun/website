'use client'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { supabase, s } from '@/components/pages/_shared'
import CsvButton from './CsvButton'
import DateField from './DateField'
import { INSTRUCTOR_PRODUCT_TYPES } from '@/lib/productType'
import BarChart, { type BarPoint } from './BarChart'
import {
 addDays, azDay, bookingDay, bookingLines, bookingsByBucket, bookingsByItem, bookingsByUser, bucketOf, creatorLabel, csvFileName, fmtDay, inPeriod,
 isAddonChild, isCancelled, isOpenRequest, methodKey, occupancy, courseOccupancy, salesByItem, presetPeriod, priceIndex,
 revenueByCategory, revenueByMethod, salesByBucket, salesByUser, validPeriod, METHOD_LABEL, PRESETS,
 type Basis, type Bk, type Bucket, type Capacity, type Cell, type Pay, type Period, type PresetId, type PriceRow, type Ref, type Series, type Sess, type CourseSess, type Table,
} from '@/lib/financeReports'

// Finances Reports (Lucas 05.11.2026): Sales nach Zahlungsdatum, Bookings nach Tauchtag (umschaltbar auf Buchungsdatum),
// Revenue nach Zahlart und nach Kategorie, Auslastung der Bootsplaetze. Nur lesend; Test-/Echtdaten folgen dem Simulationsschalter.
// Rechenlogik: lib/financeReports.ts (getestet in __tests__/financeReports.test.ts).

type Who = ((e: string | null | undefined) => string) & { id: (id: string | null | undefined) => string | null }
type ReportId = 'daily_sales' | 'monthly_sales' | 'yearly_sales' | 'sales_by_user' | 'sales_by_item' | 'revenue_by_type' | 'daily_bookings' | 'monthly_bookings' | 'yearly_bookings' | 'bookings_by_item' | 'bookings_by_user' | 'occupancy'
type Kind = 'sales' | 'bookings' | 'occupancy'

const REPORTS: Array<{ group: string; items: Array<[ReportId, string, Kind]> }> = [
 { group: 'Sales', items: [['daily_sales', 'Daily sales', 'sales'], ['monthly_sales', 'Monthly sales', 'sales'], ['yearly_sales', 'Yearly sales', 'sales'], ['sales_by_user', 'Sales by user', 'sales'], ['sales_by_item', 'Sales by item', 'sales'], ['revenue_by_type', 'Revenue by type', 'sales']] },
 { group: 'Bookings', items: [['daily_bookings', 'Daily bookings', 'bookings'], ['monthly_bookings', 'Monthly bookings', 'bookings'], ['yearly_bookings', 'Yearly bookings', 'bookings'], ['bookings_by_item', 'Bookings by item', 'bookings'], ['bookings_by_user', 'Bookings by user', 'bookings'], ['occupancy', 'Item occupancy', 'occupancy']] },
]
const ALL = REPORTS.flatMap(g => g.items)
const NIGHT_CAPACITY = 8 // wie lib/availability.ts (Night Dive: eigene Abend-Session)
const SEAT_HOLDING = new Set(['confirmed', 'completed'])
const INSTRUCTOR_TYPES = new Set<string>(INSTRUCTOR_PRODUCT_TYPES)
const DEFAULT_COURSE_QUOTA = 4 // wie components/dashboard/CourseLoad.tsx, wenn fuer den Tag kein Kontingent hinterlegt ist

/* eslint-disable @typescript-eslint/no-explicit-any */
async function fetchAll(build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: { message: string } | null }>): Promise<any[]> {
 const out: any[] = []
 for (let from = 0; ; from += 1000) {
 const { data, error } = await build(from, from + 999)
 if (error) throw new Error(error.message)
 out.push(...(data ?? []))
 if (!data || data.length < 1000) return out
 }
}
// Zeitstempel grosszuegig laden (ein Tag Rand), der genaue Azoren-Tag wird in lib/financeReports.ts geprueft.
const tsFrom = (p: Period) => `${addDays(p.from, -1)}T00:00:00Z`
const tsTo = (p: Period) => `${addDays(p.to, 2)}T00:00:00Z`

let pricesCache: Promise<PriceRow[]> | null = null
function loadPrices(): Promise<PriceRow[]> {
 if (!pricesCache) {
 pricesCache = (async () => {
 const { data, error } = await supabase.from('course_prices').select('id, name, category, kind')
 if (error) throw new Error(`Prices: ${error.message}`)
 return (data ?? []) as PriceRow[]
 })()
 pricesCache.catch(() => { pricesCache = null })
 }
 return pricesCache
}

type RawPay = { booking_id: string; amount: number; method: string; paid_at: string; recorded_by: string | null; money: any }
type RawRef = { booking_id: string; amount: number; method: string; paid_at: string; by: string | null; money: any }
type RawBk = Omit<Bk, 'creator' | 'lines'> & { created_by_email: string | null; customer: string | null; product: string | null; money: any }
type Raw =
 | { kind: 'sales'; prices: PriceRow[]; pays: RawPay[]; refs: RawRef[] }
 | { kind: 'bookings'; prices: PriceRow[]; bks: RawBk[] }
 | { kind: 'occupancy'; sessions: Sess[]; cap: Capacity; course: CourseSess[]; quotas: Array<{ from: string; to: string; max: number; priority: number }> }

const MONEY = 'customer_name, product_name, group_size, amount, booking_extras, insurance_amount'

async function loadSales(sim: boolean, p: Period): Promise<Raw> {
 const [prices, pRows, rRows] = await Promise.all([
 loadPrices(),
 fetchAll((a, b) => supabase.from('booking_payments')
 .select(`id, booking_id, amount, method, paid_at, recorded_by, bookings!inner(is_test, ${MONEY})`)
 .eq('status', 'paid').eq('bookings.is_test', sim).neq('method', 'transfer').gte('paid_at', tsFrom(p)).lt('paid_at', tsTo(p))
 .order('paid_at', { ascending: true }).range(a, b)),
 fetchAll((a, b) => supabase.from('booking_refunds')
 .select(`id, booking_id, amount, method, paid_at, authorized_by_email, requested_by_email, bookings(${MONEY})`)
 .eq('status', 'paid').eq('is_test', sim).gte('paid_at', tsFrom(p)).lt('paid_at', tsTo(p))
 .order('paid_at', { ascending: true }).range(a, b)),
 ])
 return {
 kind: 'sales', prices,
 pays: pRows.filter(x => x.paid_at).map(x => ({ booking_id: x.booking_id, amount: x.amount ?? 0, method: x.method ?? 'other', paid_at: x.paid_at, recorded_by: x.recorded_by ?? null, money: x.bookings ?? null })),
 refs: rRows.filter(x => x.paid_at).map(x => ({ booking_id: x.booking_id, amount: x.amount ?? 0, method: x.method ?? 'other', paid_at: x.paid_at, by: x.authorized_by_email ?? x.requested_by_email ?? null, money: x.bookings ?? null })),
 }
}

async function loadBookings(sim: boolean, p: Period, basis: Basis): Promise<Raw> {
 const cols = `id, booking_date, created_at, status, request_state, origin, parent_booking_id, created_by_email, ${MONEY}`
 const [prices, rows] = await Promise.all([
 loadPrices(),
 fetchAll((a, b) => {
 const q = supabase.from('bookings').select(cols).eq('is_test', sim)
 return (basis === 'dive' ? q.gte('booking_date', p.from).lte('booking_date', p.to) : q.gte('created_at', tsFrom(p)).lt('created_at', tsTo(p)))
 .order('created_at', { ascending: true }).range(a, b)
 }),
 ])
 // Aeltere Front-Office-Buchungen: Ersteller steht nur im Buchungsverlauf (booking_created)
 const missing = rows.filter(r => !r.created_by_email && r.origin !== 'website').map(r => r.id as string)
 const fromLog = new Map<string, string>()
 for (let i = 0; i < missing.length; i += 150) {
 const { data, error } = await supabase.from('booking_changelog').select('booking_id, changed_by_email, changed_at')
 .eq('action', 'booking_created').in('booking_id', missing.slice(i, i + 150)).order('changed_at', { ascending: true })
 if (error) throw new Error(`Booking log: ${error.message}`)
 for (const c of data ?? []) if (c.changed_by_email && !fromLog.has(c.booking_id)) fromLog.set(c.booking_id, c.changed_by_email)
 }
 return {
 kind: 'bookings', prices,
 bks: rows.map(r => ({
 id: r.id, booking_date: r.booking_date ?? null, created_at: r.created_at, pax: r.group_size ?? 1, amount: r.amount ?? 0, status: r.status ?? '',
 request_state: r.request_state ?? null, origin: r.origin ?? null, parent: r.parent_booking_id ?? null,
 created_by_email: r.created_by_email ?? fromLog.get(r.id) ?? null, customer: r.customer_name ?? null, product: r.product_name ?? null, money: r,
 })),
 }
}

/** Buchungen nach Tauchtag im Zeitraum, fertig fuer die Auswertungen in lib/financeReports (Overview: Jahresvergleich). */
export async function loadDiveBookings(sim: boolean, p: Period): Promise<Bk[]> {
 const [prices, rows] = await Promise.all([
 loadPrices(),
 fetchAll((a, b) => supabase.from('bookings').select(`id, booking_date, created_at, status, request_state, origin, parent_booking_id, ${MONEY}`)
 .eq('is_test', sim).gte('booking_date', p.from).lte('booking_date', p.to).order('created_at', { ascending: true }).range(a, b)),
 ])
 const idx = priceIndex(prices)
 return rows.map(r => ({
 id: r.id, booking_date: r.booking_date ?? null, created_at: r.created_at, pax: r.group_size ?? 1, amount: r.amount ?? 0, status: r.status ?? '',
 request_state: r.request_state ?? null, origin: r.origin ?? null, parent: r.parent_booking_id ?? null, creator: null, lines: bookingLines(r, idx),
 }))
}

async function loadOccupancy(sim: boolean, p: Period): Promise<Raw> {
 const [rows, boats, quota] = await Promise.all([
 fetchAll((a, b) => supabase.from('booking_sessions')
 .select('id, session_date, session, seats, status, is_boat_day, booking_id, bookings!inner(status, request_state, product_type, group_size)')
 .eq('is_test', sim).gte('session_date', p.from).lte('session_date', p.to).in('status', ['booked', 'completed'])
 .order('session_date', { ascending: true }).range(a, b)),
 supabase.from('boats').select('seats, active, company').eq('active', true),
 supabase.from('capacity_quota').select('valid_from, valid_to, max_course_students, priority').lte('valid_from', p.to).gte('valid_to', p.from),
 ])
 if (boats.error) throw new Error(`Boats: ${boats.error.message}`)
 if (quota.error) throw new Error(`Instructor capacity: ${quota.error.message}`)
 const seats = (boats.data ?? []).filter(b => (b.company ?? 'azd') === 'azd').reduce((t, b) => t + (b.seats ?? 0), 0)
 return {
 kind: 'occupancy', cap: { am: seats, pm: seats, night: NIGHT_CAPACITY },
 // Platz haelt nur eine bestaetigte Buchung (wie lib/availability.ts); Anfragen und unbezahlte Buchungen nicht.
 sessions: rows
 .filter(r => SEAT_HOLDING.has(r.bookings?.status) && (r.session === 'night' || r.is_boat_day))
 .map(r => ({ date: r.session_date, session: r.session, seats: r.seats ?? 0, booking_id: r.booking_id })),
 // Kurse und Try Scuba brauchen einen Instructor (wie lib/productType INSTRUCTOR_PRODUCT_TYPES); Schueler = Personen der Buchung
 course: rows
 .filter(r => SEAT_HOLDING.has(r.bookings?.status) && INSTRUCTOR_TYPES.has(r.bookings?.product_type))
 .map(r => ({ date: r.session_date, students: r.bookings?.group_size ?? 1, booking_id: r.booking_id })),
 quotas: (quota.data ?? []).map(q => ({ from: q.valid_from, to: q.valid_to, max: q.max_course_students ?? 0, priority: q.priority ?? 0 })),
 }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const eur2 = (c: number) => `${c < 0 ? '−' : ''}€${(Math.abs(c) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const eur0 = (c: number) => `${c < 0 ? '−' : ''}€${Math.round(Math.abs(c) / 100).toLocaleString('en-GB')}`
function show(c: Cell): string {
 if (c === null || c === undefined) return ''
 if (typeof c === 'number') return c.toLocaleString('en-GB')
 if (typeof c === 'object') return 'cents' in c ? eur2(c.cents) : c.pct === null ? '—' : `${Math.round(c.pct)} %`
 return c
}
const cents = (c: Cell | undefined) => (c && typeof c === 'object' && 'cents' in c ? c.cents : 0)
const isZeroRow = (r: Cell[]) => r.slice(1).every(c => c === null || c === 0 || (typeof c === 'object' && ('cents' in c ? c.cents === 0 : !c.pct)))

const lbl: CSSProperties = { fontSize: '14px', color: s.muted, textTransform: 'uppercase', letterSpacing: '.08em' }
const chip = (on: boolean): CSSProperties => ({ padding: '6px 12px', borderRadius: 'var(--radius-control)', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${on ? 'color-mix(in srgb, var(--text) 50%, transparent)' : 'rgba(255,255,255,.12)'}`, background: on ? 'color-mix(in srgb, var(--text) 12%, transparent)' : 'transparent', color: on ? s.accent : s.muted, whiteSpace: 'nowrap' })
const inp: CSSProperties = { background: 'var(--bg)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 'var(--radius-card)', color: s.text, fontSize: '14px', fontFamily: 'inherit', padding: '6px 9px', colorScheme: 'dark' }

type BookingLink = { col: number; ids: string[]; open: (id: string) => void }

function DataTable({ table, onRow, link }: { table: Table; onRow?: (i: number) => void; link?: BookingLink }) {
 const td = (i: number): CSSProperties => ({ padding: '8px 10px', textAlign: table.align[i] === 'r' ? 'right' : 'left', whiteSpace: i === 0 ? 'normal' : 'nowrap', fontVariantNumeric: 'tabular-nums' })
 if (table.rows.length === 0) return <div style={{ fontSize: '14px', color: s.muted, padding: '8px 0' }}>Nothing in this period.</div>
 return (
 <div style={{ overflowX: 'auto' }}>
 <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
 <thead>
 <tr>{table.headers.map((h, i) => <th key={h} style={{ ...td(i), ...lbl, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,.14)' }}>{h}</th>)}</tr>
 </thead>
 <tbody>
 {table.rows.map((r, ri) => (
 <tr key={ri} onClick={onRow ? () => onRow(ri) : undefined} title={onRow ? 'Click to see what is behind this line' : undefined} style={{ cursor: onRow ? 'pointer' : 'default' }}>
 {r.map((c, i) => (
 <td key={i} style={{ ...td(i), color: i === 0 ? (onRow ? s.accent : s.text) : s.sub, borderBottom: '1px solid rgba(255,255,255,.06)' }}>
 {link && i === link.col && link.ids[ri]
 ? <button type="button" onClick={e => { e.stopPropagation(); link.open(link.ids[ri]) }} title="Open booking" style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', color: 'var(--text)', fontWeight: 500, background: 'transparent', border: '1px solid color-mix(in srgb, var(--text) 35%, transparent)', borderRadius: 'var(--radius-control)', padding: '0 6px', cursor: 'pointer', fontSize: '14px' }}>{show(c)}</button>
 : show(c)}
 </td>
 ))}
 </tr>
 ))}
 {table.total && (
 <tr>{table.total.map((c, i) => <td key={i} style={{ ...td(i), color: s.text, fontWeight: 500, borderTop: '1px solid rgba(255,255,255,.18)' }}>{show(c)}</td>)}</tr>
 )}
 </tbody>
 </table>
 </div>
 )
}

/** Popup mit den Einzelposten eines Balkens bzw. einer Tabellenzeile. Schliessen: Knopf, Klick daneben oder Escape. */
function DetailPopup({ title, sub, summary, table, file, link, onClose, children }: {
 title: string; sub: string; summary: Array<[string, string]>; table: Table; file: string; link: BookingLink; onClose: () => void; children?: ReactNode
}) {
 useEffect(() => {
 const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
 window.addEventListener('keydown', h)
 return () => window.removeEventListener('keydown', h)
 }, [onClose])
 return (
 <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px', overflowY: 'auto' }}>
 <div role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()} style={{ width: 'min(1040px, 100%)', background: 'var(--surface)', border: '1px solid color-mix(in srgb, var(--text) 25%, transparent)', borderRadius: 'var(--radius-card)', boxShadow: 'none', overflow: 'hidden' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
 <div>
 <div style={{ fontSize: '16px', fontWeight: 500, color: s.text }}>{title}</div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px' }}>{sub}</div>
 </div>
 <button type="button" onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: s.text, borderRadius: 'var(--radius-control)', padding: '6px 14px', cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit' }}>Close</button>
 </div>
 <div style={{ padding: '18px 20px 22px' }}>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
 {summary.map(([l, v]) => (
 <div key={l} style={{ background: 'color-mix(in srgb, var(--text) 7%, transparent)', borderRadius: 'var(--radius-card)', padding: '9px 13px', minWidth: '104px' }}>
 <div style={{ ...lbl, fontSize: '14px' }}>{l}</div>
 <div style={{ fontSize: '16px', fontWeight: 500, color: s.text, marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
 </div>
 ))}
 </div>
 {children}
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>{table.rows.length} line{table.rows.length === 1 ? '' : 's'}</div>
 <CsvButton fileName={file} table={table} />
 </div>
 <DataTable table={table} link={link} />
 </div>
 </div>
 </div>
 )
}

type Block = { title: string; file: string; table: Table; note?: string; keys?: string[] }
type Detail = { table: Table; ids: string[]; col: number; sub: string; note?: string }
type View = { kpis: Array<[string, string, string?]>; series?: BarPoint[]; blocks: Block[]; intro: string; detail?: (key: string) => Detail }
/** Balken mit den Kernzahlen ihrer Tabellenzeile (Feld beim Ueberfahren mit der Maus). */
function bars(res: { table: Table; series: Series; keys: string[] }, only?: string[]): BarPoint[] {
 const at = new Map(res.keys.map((k, i) => [k, i]))
 return res.series.filter(x => !only || only.includes(x.key)).map(x => {
 const row = res.table.rows[at.get(x.key) ?? -1]
 return { ...x, tip: row ? res.table.headers.slice(1).map((h, i) => [h, show(row[i + 1])] as [string, string]) : [] }
 })
}

const azTimeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Atlantic/Azores', hour: '2-digit', minute: '2-digit', hour12: false })
const azTime = (iso: string) => azTimeFmt.format(new Date(iso))
const ref8 = (id: string) => id.slice(0, 8).toUpperCase()
const cap = (x: string) => (x ? x.charAt(0).toUpperCase() + x.slice(1).replace(/_/g, ' ') : '')

export default function FinanceReports({ simulationMode, who, isMobile, onOpenBooking }: { simulationMode: boolean | null; who: Who; isMobile: boolean; onOpenBooking: (id: string) => void }) {
 const today = azDay(new Date())
 const [report, setReport] = useState<ReportId>(() => {
 if (typeof window === 'undefined') return 'daily_sales'
 try { const v = localStorage.getItem('azd_finReport'); return ALL.some(r => r[0] === v) ? (v as ReportId) : 'daily_sales' } catch { return 'daily_sales' }
 })
 const [preset, setPreset] = useState<PresetId | 'custom'>('month')
 const [custom, setCustom] = useState<Period>(() => presetPeriod('month', today))
 const [basis, setBasis] = useState<Basis>('dive')
 const [tick, setTick] = useState(0)
 const [raw, setRaw] = useState<{ key: string; data: Raw } | null>(null)
 const [err, setErr] = useState<{ key: string; msg: string } | null>(null)
 // Geoeffnete Tabellenzeile; gilt nur fuer den Datenstand (key), zu dem sie angeklickt wurde
 const [picked, setPicked] = useState<{ forKey: string; report: ReportId; bucket: string } | null>(null)

 // Jahres-Reports: immer alle Jahre (ab 2024 bis Ende naechstes Jahr, wegen Buchungen in der Zukunft), kein Zeitraum-Filter
 const yearly = report === 'yearly_sales' || report === 'yearly_bookings'
 // Jahres-Reports: 'all' = alle Jahre zusammen, sonst zeigen die Kacheln nur das gewaehlte Jahr (Lucas 05.11.)
 const [yearPick, setYearPick] = useState('all')
 let yearKeys: string[] = []
 const thisYear = today.slice(0, 4)
 const period = yearly ? { from: '2024-01-01', to: `${Number(thisYear) + 1}-12-31` } : preset === 'custom' ? custom : presetPeriod(preset, today)
 const periodOk = validPeriod(period)
 const kind = ALL.find(r => r[0] === report)![2]
 const key = `${kind}|${simulationMode}|${period.from}|${period.to}|${kind === 'bookings' ? basis : ''}|${tick}`

 useEffect(() => {
 if (simulationMode === null || !periodOk) return
 let alive = true
 const p = { from: period.from, to: period.to }
 const job = kind === 'sales' ? loadSales(simulationMode, p) : kind === 'bookings' ? loadBookings(simulationMode, p, basis) : loadOccupancy(simulationMode, p)
 job.then(data => { if (alive) setRaw({ key, data }) }).catch(e => { if (alive) setErr({ key, msg: e instanceof Error ? e.message : String(e) }) })
 return () => { alive = false }
 }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

 const pick = (id: ReportId) => { setReport(id); try { localStorage.setItem('azd_finReport', id) } catch { /* private mode */ } }
 const file = (name: string) => csvFileName(name, period, Boolean(simulationMode))
 const data = raw && raw.key === key ? raw.data : null
 const error = err && err.key === key ? err.msg : null
 const long = period.from < addDays(period.to, -62)
 // Lange Zeitraeume: Tage ohne Bewegung ausblenden (gilt genauso fuer den Download)
 const keep = (t: Table, keys: string[], ok: (r: Cell[]) => boolean): { table: Table; keys: string[] } => {
 const idx = t.rows.map((r, i) => (ok(r) ? i : -1)).filter(i => i >= 0)
 return { table: { ...t, rows: idx.map(i => t.rows[i]) }, keys: idx.map(i => keys[i]) }
 }
 const trimDays = (t: Table, keys: string[]) => (long ? keep(t, keys, r => !isZeroRow(r)) : { table: t, keys })
 const hidden = long ? ' Days without activity are hidden.' : ''
 // Jahres-Reports: leere Jahre ausblenden, das laufende Jahr bleibt immer stehen
 const trimYears = (t: Table, keys: string[]) => keep(t, keys, r => r[0] === thisYear || !isZeroRow(r))
 const yearsNote = ' All years with data are shown. Figures start with the first booking in this system; earlier years follow when the old booking data is imported.'

 let view: View | null = null
 if (data?.kind === 'sales' && kind === 'sales') {
 const idx = priceIndex(data.prices)
 const lines = (m: unknown) => (m ? bookingLines(m as Parameters<typeof bookingLines>[0], idx) : [])
 type Extra = { booking_id: string; customer: string | null; product: string | null }
 const pays: Array<Pay & Extra> = data.pays.map(x => ({ booking_id: x.booking_id, customer: x.money?.customer_name ?? null, product: x.money?.product_name ?? null, amount: x.amount, method: x.method, paid_at: x.paid_at, user: x.recorded_by ? who.id(x.recorded_by) ?? 'Staff (name not set)' : null, lines: lines(x.money) }))
 const refs: Array<Ref & Extra> = data.refs.map(x => ({ booking_id: x.booking_id, customer: x.money?.customer_name ?? null, product: x.money?.product_name ?? null, amount: x.amount, method: x.method, paid_at: x.paid_at, user: x.by ? who(x.by) : null, lines: lines(x.money) }))
 // Einzelposten hinter einem Tag / Monat / Jahr: jede Zahlung und jeder Refund, in zeitlicher Reihenfolge
 const salesDetail = (bucket: Bucket) => (k: string): Detail => {
 const inB = (iso: string) => { const d = azDay(iso); return inPeriod(d, period) && bucketOf(d, bucket) === k }
 const rows = [
 ...pays.filter(x => inB(x.paid_at)).map(x => ({ x, type: 'Payment received', signed: x.amount })),
 ...refs.filter(x => inB(x.paid_at)).map(x => ({ x, type: 'Refund', signed: -x.amount })),
 ].sort((a, b) => a.x.paid_at.localeCompare(b.x.paid_at))
 return {
 col: 5, ids: rows.map(r => r.x.booking_id), sub: 'Every payment received and every refund paid out, by payment date.',
 table: {
 headers: ['Date', 'Time', 'Type', 'Customer', 'Product', 'Booking', 'Method', 'Recorded by', 'Amount'], align: ['l', 'l', 'l', 'l', 'l', 'l', 'l', 'l', 'r'],
 rows: rows.map(r => [fmtDay(azDay(r.x.paid_at)), azTime(r.x.paid_at), r.type, r.x.customer ?? '', r.x.product ?? '', ref8(r.x.booking_id), METHOD_LABEL[methodKey(r.x.method)] ?? r.x.method, r.x.user ?? 'Online / automatic', { cents: r.signed }]),
 total: ['Net', '', '', '', '', '', '', '', { cents: rows.reduce((t, r) => t + r.signed, 0) }],
 },
 }
 }
 const month = salesByBucket(pays, refs, period, 'month')
 const tot = month.table.total!
 const kpis: View['kpis'] = [['Received', eur2(cents(tot[2])), 'var(--text)'], ['Refunded', eur2(cents(tot[4]))], ['Net', eur2(cents(tot[5])), s.accent], ['Payments', String(tot[1])]]
 const basisNote = 'Money received minus refunds paid out, by payment date. Moves between linked bookings are not counted.'
 if (report === 'daily_sales') { const d = salesByBucket(pays, refs, period, 'day'); view = { kpis, series: bars(d), detail: salesDetail('day'), intro: basisNote + hidden, blocks: [{ title: 'Sales per day', file: file('daily-sales'), ...trimDays(d.table, d.keys) }] } }
 else if (report === 'monthly_sales') view = { kpis, series: bars(month), detail: salesDetail('month'), intro: basisNote, blocks: [{ title: 'Sales per month', file: file('monthly-sales'), table: month.table, keys: month.keys }] }
 else if (report === 'yearly_sales') {
 const y = salesByBucket(pays, refs, period, 'year'); const t = trimYears(y.table, y.keys); yearKeys = t.keys
 const r = t.table.rows[t.keys.indexOf(yearPick)]
 const yk: View['kpis'] = r ? [['Received', eur2(cents(r[2])), 'var(--text)'], ['Refunded', eur2(cents(r[4]))], ['Net', eur2(cents(r[5])), s.accent], ['Payments', String(r[1])]] : kpis
 view = { kpis: yk, series: bars(y, t.keys).map(b => ({ ...b, mark: b.key === yearPick })), detail: salesDetail('year'), intro: basisNote + yearsNote, blocks: [{ title: 'Sales per year', file: csvFileName('yearly-sales', null, Boolean(simulationMode)), ...t }] }
 }
 else if (report === 'sales_by_item') view = { kpis, intro: basisNote, blocks: [{ title: 'Sales by item', file: file('sales-by-item'), table: salesByItem(pays, refs, period), note: 'Money received per product and per extra (equipment, add-ons, insurance). A payment for a booking with several items is split in proportion to their prices, so "Payments" counts every payment that touched the item.' }] }
 else if (report === 'sales_by_user') view = { kpis, intro: basisNote, blocks: [{ title: 'Sales by user', file: file('sales-by-user'), table: salesByUser(pays, refs, period), note: 'A payment counts for the person who recorded it. Online payments count as "Online / automatic". A refund counts for the person who authorised it.' }] }
 else view = { kpis, intro: basisNote, blocks: [
 { title: 'By payment method', file: file('revenue-by-payment-method'), table: revenueByMethod(pays, refs, period), note: 'Online payments with MB WAY run through Stripe and count as "Card / Stripe".' },
 { title: 'By category', file: file('revenue-by-category'), table: revenueByCategory(pays, refs, period), note: 'A payment is one amount per booking. It is split across the items of the booking by their share of the booking value. Example: a deposit of 50 % counts 50 % for each item.' },
 ] }
 } else if (data?.kind === 'bookings' && kind === 'bookings') {
 const idx = priceIndex(data.prices)
 const bks: Array<Bk & { customer: string | null; product: string | null }> = data.bks.map(b => ({ ...b, creator: b.created_by_email ? who(b.created_by_email) : null, lines: bookingLines(b.money, idx) }))
 // Einzelposten hinter einem Tag / Monat / Jahr: jede Buchung, auch stornierte und offene Anfragen (in der Spalte Status erkennbar)
 const bookingsDetail = (bucket: Bucket) => (k: string): Detail => {
 const rows = bks.filter(b => { const d = bookingDay(b, basis); return Boolean(d) && inPeriod(d!, period) && bucketOf(d!, bucket) === k })
 .sort((a, b) => (bookingDay(a, basis) ?? '').localeCompare(bookingDay(b, basis) ?? '') || a.created_at.localeCompare(b.created_at))
 const counted = rows.filter(b => !isCancelled(b) && !isOpenRequest(b))
 const status = (b: Bk) => (isCancelled(b) ? 'Cancelled' : isOpenRequest(b) ? 'Open request' : isAddonChild(b) ? 'Extra added later' : cap(b.status))
 return {
 col: 8, ids: rows.map(b => b.id), sub: `Every booking with ${basis === 'dive' ? 'a dive day' : 'a booking day'} in this period.`,
 note: 'Cancelled bookings and open requests are listed here but not counted. An extra added later counts for the value, not as a booking or a diver.',
 table: {
 headers: ['Dive day', 'Booked on', 'Customer', 'Product', 'Pax', 'Booked value', 'Status', 'Created by', 'Booking'], align: ['l', 'l', 'l', 'l', 'r', 'r', 'l', 'l', 'l'],
 rows: rows.map(b => [b.booking_date ? fmtDay(b.booking_date) : '', fmtDay(azDay(b.created_at)), b.customer ?? '', b.product ?? '', b.pax, { cents: b.amount }, status(b), creatorLabel(b), ref8(b.id)]),
 total: ['Counted in the report', '', '', '', counted.filter(b => !isAddonChild(b)).reduce((t, b) => t + b.pax, 0), { cents: counted.reduce((t, b) => t + b.amount, 0) }, '', '', ''],
 },
 }
 }
 const month = bookingsByBucket(bks, period, basis, 'month')
 const t = month.totals
 const kpis: View['kpis'] = [['Bookings', String(t.bookings), s.accent], ['Pax', String(t.pax)], ['Booked value', eur0(t.value)], ['Cancelled', String(t.cancelled)], ['Open requests', String(t.requests)]]
 const basisNote = `Bookings by ${basis === 'dive' ? 'dive day' : 'the day the booking was made'}. Cancelled bookings and open requests are listed separately and not counted in bookings, pax or value.`
 if (report === 'daily_bookings') { const d = bookingsByBucket(bks, period, basis, 'day'); view = { kpis, series: bars(d), detail: bookingsDetail('day'), intro: basisNote + hidden, blocks: [{ title: 'Bookings per day', file: file(`daily-bookings-${basis}`), ...trimDays(d.table, d.keys) }] } }
 else if (report === 'monthly_bookings') view = { kpis, series: bars(month), detail: bookingsDetail('month'), intro: basisNote, blocks: [{ title: 'Bookings per month', file: file(`monthly-bookings-${basis}`), table: month.table, keys: month.keys }] }
 else if (report === 'yearly_bookings') {
 const y = bookingsByBucket(bks, period, basis, 'year'); const t = trimYears(y.table, y.keys); yearKeys = t.keys
 const r = t.table.rows[t.keys.indexOf(yearPick)]
 const yk: View['kpis'] = r ? [['Bookings', String(r[1]), s.accent], ['Pax', String(r[2])], ['Booked value', eur0(cents(r[3]))], ['Cancelled', String(r[4])], ['Open requests', String(r[5])]] : kpis
 view = { kpis: yk, series: bars(y, t.keys).map(b => ({ ...b, mark: b.key === yearPick })), detail: bookingsDetail('year'), intro: basisNote + yearsNote, blocks: [{ title: 'Bookings per year', file: csvFileName(`yearly-bookings-${basis}`, null, Boolean(simulationMode)), ...t }] }
 }
 else if (report === 'bookings_by_item') view = { kpis, intro: basisNote, blocks: [{ title: 'Bookings by item', file: file(`bookings-by-item-${basis}`), table: bookingsByItem(bks, period, basis), note: 'Each product and each extra (equipment, add-ons, insurance) is one line. Quantity = divers for a product, pieces for an extra.' }] }
 else view = { kpis, intro: basisNote, blocks: [{ title: 'Bookings by user', file: file(`bookings-by-user-${basis}`), table: bookingsByUser(bks, period, basis), note: 'Who created the booking. Extras added later count for the value of the person who added them, not as a new booking. For older bookings the creator comes from the booking log; where it was never logged the line reads "creator not recorded".' }] }
 } else if (data?.kind === 'occupancy' && kind === 'occupancy') {
 const o = occupancy(data.sessions, data.cap, period)
 // Tageskontingent: Eintrag mit der hoechsten Prioritaet, der den Tag abdeckt (wie das Dashboard-Widget "Course load")
 const quotaOf = (d: string) => data.quotas.filter(q => q.from <= d && q.to >= d).sort((x, y) => y.priority - x.priority)[0]?.max ?? DEFAULT_COURSE_QUOTA
 const c = courseOccupancy(data.course, quotaOf, period)
 const pc = (a: number, b: number) => (b > 0 ? `${Math.round(a / b * 100)} %` : '—')
 view = {
 kpis: [['Boat sessions', String(o.trips)], ['Boat seats booked', `${o.seats} of ${o.capacity}`], ['Average boat occupancy', pc(o.seats, o.capacity), s.accent], ['Course days', String(c.days)], ['Average course occupancy', pc(c.students, c.quota), s.accent]],
 intro: `Boats: booked seats against the seats of the active boats (${data.cap.am} per morning or afternoon session, ${data.cap.night} per night dive). Courses: students per day against the instructor capacity of that day. Only confirmed bookings count. Sessions and days without a booking are not listed, so the averages are for sessions that really ran.`,
 blocks: [
 { title: 'Average boat occupancy by session', file: file('occupancy-average'), table: o.summary },
 { title: 'Boat occupancy per session', file: file('occupancy-boats'), table: o.table, note: 'Boat days without a set time (TBD) are left out.' },
 { title: 'Course students per day', file: file('occupancy-courses'), table: c.table, note: `Courses and try-scuba bookings need an instructor. Capacity is the daily course quota; a day without a quota counts with ${DEFAULT_COURSE_QUOTA} students.` },
 ],
 }
 }

 const title = ALL.find(r => r[0] === report)![1]
 // Popup mit den Einzelposten zur angeklickten Tabellenzeile (die Balken zeigen ihre Kernzahlen beim Ueberfahren)
 const pickBucket = (bucket: string) => setPicked({ forKey: key, report, bucket })
 const openKey = picked && picked.forKey === key && picked.report === report ? picked.bucket : null
 let popup: ReactNode = null
 if (view?.detail && openKey) {
 const d = view.detail(openKey)
 const block = view.blocks[0]
 const ri = block.keys ? block.keys.indexOf(openKey) : -1
 const point = view.series?.find(x => x.key === openKey)
 const row = ri >= 0 ? block.table.rows[ri] : null
 popup = (
 <DetailPopup title={`${title} · ${point?.label ?? (row ? show(row[0]) : openKey)}`} sub={`${d.sub}${simulationMode ? ' Test data.' : ''}`}
 summary={row ? block.table.headers.slice(1).map((h, i) => [h, show(row[i + 1])] as [string, string]) : []}
 table={d.table} file={csvFileName(`${report.replace(/_/g, '-')}-details-${openKey}`, null, Boolean(simulationMode))}
 link={{ col: d.col, ids: d.ids, open: onOpenBooking }} onClose={() => setPicked(null)}>
 {d.note && <div style={{ fontSize: '14px', color: s.muted, lineHeight: 1.5, marginBottom: '12px' }}>{d.note}</div>}
 </DetailPopup>
 )
 }
 return (
 <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '190px 1fr', gap: isMobile ? '14px' : '26px' }}>
 {/* Report-Auswahl */}
 {isMobile ? (
 <select value={report} onChange={e => pick(e.target.value as ReportId)} style={{ ...inp, padding: '9px 10px', width: '100%' }}>
 {REPORTS.map(g => <optgroup key={g.group} label={g.group}>{g.items.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</optgroup>)}
 </select>
 ) : (
 <div>
 {REPORTS.map(g => (
 <div key={g.group} style={{ marginBottom: '18px' }}>
 <div style={{ ...lbl, marginBottom: '6px' }}>{g.group}</div>
 {g.items.map(([id, l]) => (
 <button key={id} type="button" onClick={() => pick(id)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 'var(--radius-control)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px', fontWeight: 500, background: report === id ? 'color-mix(in srgb, var(--text) 12%, transparent)' : 'transparent', color: report === id ? s.accent : s.sub }}>{l}</button>
 ))}
 </div>
 ))}
 </div>
 )}

 <div style={{ minWidth: 0 }}>
 <div style={{ fontSize: '17px', fontWeight: 500, color: s.text, marginBottom: '10px' }}>{title}{simulationMode ? <span style={{ fontSize: '14px', fontWeight: 500, color: s.muted, marginLeft: '10px' }}>Test data</span> : null}</div>

 {/* Zeitraum */}
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
 {/* Ein Auswahlfeld statt vieler Knoepfe (Lucas 05.11.: weniger ist mehr) */}
 {!yearly && (
 <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: s.muted }}>
 Period
 <select value={preset} aria-label="Period" style={{ ...inp, fontWeight: 500, padding: '7px 10px', cursor: 'pointer' }}
 onChange={e => setPreset(e.target.value as PresetId)}>
 {PRESETS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
 <option value="custom" disabled hidden>Custom dates</option>
 </select>
 </label>
 )}
 {!yearly && <button type="button" onClick={() => { if (preset !== 'custom') { setCustom(period); setPreset('custom') } }} aria-pressed={preset === 'custom'} style={chip(preset === 'custom')}>Custom</button>}
 {!yearly && preset === 'custom' && (
 <>
 {/* Liegt das neue Datum hinter dem anderen Ende, zieht das andere Ende mit */}
 <DateField label="From" value={custom.from} onChange={v => setCustom(c => ({ from: v, to: c.to < v ? v : c.to }))} />
 <span style={{ color: s.muted, fontSize: '14px' }}>to</span>
 <DateField label="To" value={custom.to} onChange={v => setCustom(c => ({ from: c.from > v ? v : c.from, to: v }))} />
 </>
 )}
 {yearly && (
 <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: s.muted }}>
 Year
 <select value={yearKeys.includes(yearPick) ? yearPick : 'all'} aria-label="Year" onChange={e => setYearPick(e.target.value)} style={{ ...inp, fontWeight: 500, padding: '7px 10px', cursor: 'pointer' }}>
 <option value="all">All years</option>
 {[...yearKeys].reverse().map(k => <option key={k} value={k}>{k}</option>)}
 </select>
 </label>
 )}
 <span style={{ fontSize: '14px', color: periodOk || yearly ? s.muted : 'var(--text)' }}>{yearly ? (yearKeys.includes(yearPick) ? `The figures above show ${yearPick}. The table lists every year.` : '') : periodOk ? (preset === 'custom' ? '' : `${fmtDay(period.from)} to ${fmtDay(period.to)}`) : 'Please pick a start day and an end day. The start day must not be after the end day.'}</span>
 <button type="button" onClick={() => setTick(n => n + 1)} style={{ ...chip(false), marginLeft: 'auto' }}>Refresh</button>
 </div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: kind === 'bookings' ? '16px' : '6px', fontSize: '14px', color: s.muted }}>
 {kind === 'bookings' && (
 <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', }}>
 <span>Count by</span>
 <select value={basis} aria-label="Count by" onChange={e => setBasis(e.target.value as Basis)} style={{ ...inp, fontWeight: 500, padding: '7px 10px', cursor: 'pointer' }}>
 <option value="dive">Dive day</option>
 <option value="created">Booking day</option>
 </select>
 </span>
 )}
 </div>

 {error && <div style={{ color: 'var(--text)', fontSize: '14px', padding: '8px 0' }}>Could not load this report: {error}</div>}
 {!error && periodOk && !view && <div style={{ color: s.muted, fontSize: '14px', padding: '8px 0' }}>Loading...</div>}

 {!error && periodOk && view && (
 <>
 <div style={{ fontSize: '14px', color: s.muted, lineHeight: 1.55, marginBottom: '14px' }}>{view.intro}</div>
 <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : `repeat(${view.kpis.length}, 1fr)`, gap: '10px', marginBottom: '18px' }}>
 {view.kpis.map(([l, v, c]) => (
 <div key={l} style={{ background: 'color-mix(in srgb, var(--text) 7%, transparent)', borderRadius: 'var(--radius-card)', padding: '12px 14px' }}>
 <div style={lbl}>{l}</div>
 <div style={{ fontSize: '20px', fontWeight: 500, color: c ?? s.text, marginTop: '6px', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
 </div>
 ))}
 </div>
 {view.series && <BarChart series={view.series} hint={view.detail ? 'Move the mouse over a bar to see its numbers. Click a line in the table for the single payments or bookings.' : undefined} />}
 {view.blocks.map(b => (
 <div key={b.title} style={{ marginBottom: '26px' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>{b.title}</div>
 <CsvButton fileName={b.file} table={b.table} />
 </div>
 {b.note && <div style={{ fontSize: '14px', color: s.muted, lineHeight: 1.5, marginBottom: '8px' }}>{b.note}</div>}
 <DataTable table={b.table} onRow={view.detail && b.keys ? i => pickBucket(b.keys![i]) : undefined} />
 </div>
 ))}
 </>
 )}
 {popup}
 </div>
 </div>
 )
}
