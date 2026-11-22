'use client'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase, s } from './_shared'
import { PAYMENT_STATE_LABEL, PAYMENT_STATE_COLOR, type PaymentState } from '@/lib/paymentState'
import CsvButton from '@/components/finance/CsvButton'
import BarChart, { type BarPoint } from '@/components/finance/BarChart'
import DateField from '@/components/finance/DateField'
import { loadDiveBookings } from '@/components/finance/FinanceReports'
import { bookingsByBucket, csvFileName, methodKey, METHOD_LABEL, type Bk, type Table } from '@/lib/financeReports'

// Finances Overview / Upcoming: echte Zahlen aus dem Ledger (booking_payments paid, booking_refunds paid).
// Overview (Lucas 05.11.2026) ersetzt die frueheren Tabs "Today" und "Month to Date": ein Tab mit Zeitraum-Auswahl
// Day / Month / Year, Blaettern und Datumsfeld.
// Umbuchungen zwischen verknuepften Buchungen (method 'transfer') sind kein Umsatz und werden hier nicht gezaehlt.
// Test-/Echtdaten folgen dem Simulationsschalter (wie History / Action needed). Zeitgrenzen = lokale Zeit des Browsers.

type Pay = { id: string; booking_id: string; amount: number; method: string; paid_at: string; recorded_by: string | null; customer: string | null; product: string | null; pax: number }
type Ref = { id: string; booking_id: string; amount: number; method: string; paid_at: string; by: string | null; customer: string | null; product: string | null; note: string | null }
type Up = { id: string; date: string; customer: string | null; product: string | null; pax: number; amount: number; paid: number; open: number; state: PaymentState | null; status: string }
type Data = { pays: Pay[]; refs: Ref[]; upcoming: Up[]; loadedAt: number }
type Ledger = { pays: Pay[]; refs: Ref[] }
type Who = ((e: string | null | undefined) => string) & { id: (id: string | null | undefined) => string | null }
type Mode = 'day' | 'month' | 'year'

const ML: Record<string, string> = { cash: ' Cash', bank_transfer: ' Bank transfer', bank: ' Bank transfer', card: ' Card', stripe: ' Stripe', revolut: ' Revolut', mb_way: ' MB WAY', on_arrival: ' On arrival', other: ' Other' }
const eur0 = (c: number) => `${c < 0 ? '−' : ''}€${Math.round(Math.abs(c) / 100).toLocaleString('en-GB')}`
const eur2 = (c: number) => `${c < 0 ? '−' : ''}€${(Math.abs(c) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const sum = <T,>(a: T[], f: (x: T) => number) => a.reduce((t, x) => t + f(x), 0)
// CSV-Download (Lucas 05.11.): Datum DD.MM.YYYY, Zahlart ohne Symbol
const dmy = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const mName = (m: string) => METHOD_LABEL[methodKey(m)] ?? m
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// Ein Ladevorgang pro Modus, kurz gecacht: Kopfzeile und Tabs teilen sich dieselben Daten.
const TTL = 60_000
const cache = new Map<string, { at: number; p: Promise<Data> }>()
const ledgerCache = new Map<string, { at: number; p: Promise<Ledger> }>()
const bkCache = new Map<string, { at: number; p: Promise<Bk[]> }>()

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
 const out: T[] = []
 for (let from = 0; ; from += 1000) {
 const { data, error } = await build(from, from + 999)
 if (error) throw new Error(error.message)
 out.push(...(data ?? []))
 if (!data || data.length < 1000) return out
 }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Bezahlte Zahlungen und Refunds ab `from` (ISO), optional bis vor `to`. */
async function loadLedger(sim: boolean, from: string, to?: string): Promise<Ledger> {
 const [pRows, rRows] = await Promise.all([
 fetchAll<any>((a, b) => {
 let q = supabase.from('booking_payments')
 .select('id, booking_id, amount, method, paid_at, recorded_by, bookings!inner(customer_name, product_name, group_size, is_test)')
 .eq('status', 'paid').eq('bookings.is_test', sim).neq('method', 'transfer').gte('paid_at', from)
 if (to) q = q.lt('paid_at', to)
 return q.order('paid_at', { ascending: false }).range(a, b)
 }),
 fetchAll<any>((a, b) => {
 let q = supabase.from('booking_refunds')
 .select('id, booking_id, amount, method, paid_at, description, authorized_by_email, requested_by_email, bookings(customer_name, product_name)')
 .eq('status', 'paid').eq('is_test', sim).gte('paid_at', from)
 if (to) q = q.lt('paid_at', to)
 return q.order('paid_at', { ascending: false }).range(a, b)
 }),
 ])
 const pays: Pay[] = pRows.filter(p => p.paid_at).map(p => ({ id: p.id, booking_id: p.booking_id, amount: p.amount ?? 0, method: p.method ?? 'other', paid_at: p.paid_at, recorded_by: p.recorded_by,
 customer: p.bookings?.customer_name ?? null, product: p.bookings?.product_name ?? null, pax: p.bookings?.group_size ?? 1 }))
 const refs: Ref[] = rRows.filter(r => r.paid_at).map(r => ({ id: r.id, booking_id: r.booking_id, amount: r.amount ?? 0, method: r.method ?? 'other', paid_at: r.paid_at,
 by: r.authorized_by_email ?? r.requested_by_email ?? null, customer: r.bookings?.customer_name ?? null, product: r.bookings?.product_name ?? null, note: r.description ?? null }))
 return { pays, refs }
}

async function load(sim: boolean): Promise<Data> {
 const now = new Date()
 const start = new Date(Math.min(new Date(now.getFullYear(), 0, 1).getTime(), new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime())).toISOString()
 const today = ymd(now)
 const until = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14))
 const [ledger, bRows] = await Promise.all([
 loadLedger(sim, start),
 fetchAll<any>((a, b) => supabase.from('bookings')
 .select('id, booking_date, customer_name, product_name, group_size, amount, status, payment_state, booking_payments(amount, status)')
 .eq('is_test', sim).neq('status', 'cancelled').gte('booking_date', today).lte('booking_date', until)
 .order('booking_date', { ascending: true }).range(a, b)),
 ])
 const upcoming: Up[] = bRows.map(b => {
 // Gezahlt = alle bezahlten Ledger-Zeilen der Buchung (inkl. Umbuchungen, die gehoeren zum Saldo dieser Buchung)
 const paid = sum((b.booking_payments ?? []).filter((x: any) => x.status === 'paid'), (x: any) => x.amount ?? 0)
 const state = (b.payment_state ?? null) as PaymentState | null
 const open = state === 'unpaid' || state === 'deposit' || state === null ? Math.max(0, (b.amount ?? 0) - paid) : 0
 return { id: b.id, date: b.booking_date, customer: b.customer_name ?? null, product: b.product_name ?? null, pax: b.group_size ?? 1, amount: b.amount ?? 0, paid, open, state, status: b.status }
 })
 return { ...ledger, upcoming, loadedAt: Date.now() }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function useCached<T>(store: Map<string, { at: number; p: Promise<T> }>, key: string | null, run: () => Promise<T>, tick: number) {
 const [state, setState] = useState<{ key: string; data: T } | null>(null)
 const [error, setError] = useState<{ key: string; msg: string } | null>(null)
 useEffect(() => {
 if (key === null) return
 let alive = true
 let c = store.get(key)
 if (!c || Date.now() - c.at > TTL) { c = { at: Date.now(), p: run() }; store.set(key, c) }
 c.p.then(d => { if (alive) { setError(null); setState({ key, data: d }) } }).catch(e => { store.delete(key); if (alive) setError({ key, msg: e instanceof Error ? e.message : String(e) }) })
 return () => { alive = false }
 }, [key, tick]) // eslint-disable-line react-hooks/exhaustive-deps
 // Nur Daten bzw. Fehler zum aktuellen Schluessel zeigen (nie die Zahlen eines anderen Jahres oder Modus)
 return { data: state && state.key === key ? state.data : null, error: error && error.key === key ? error.msg : null }
}

function useFinanceData(sim: boolean | null, tick: number) {
 return useCached(cache, sim === null ? null : String(sim), () => load(Boolean(sim)), tick)
}

/** Ledger fuer das gewaehlte Jahr und das Jahr davor (Vergleich mit Vormonat / Vorjahr). */
function useLedger(sim: boolean | null, year: number, tick: number) {
 return useCached(ledgerCache, sim === null ? null : `${sim}:${year}`,
 () => loadLedger(Boolean(sim), new Date(year - 1, 0, 1).toISOString(), new Date(year + 1, 0, 1).toISOString()), tick)
}

function windows() {
 const n = new Date()
 const dayStart = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()
 return { n, dayStart, today: ymd(n), in7: ymd(new Date(n.getFullYear(), n.getMonth(), n.getDate() + 7)) }
}
const t = (iso: string) => new Date(iso).getTime()

/** Kopfzeile neben den Tabs: heute eingegangen + offene Betraege der naechsten 7 Tage. */
export function FinanceHeadline({ simulationMode }: { simulationMode: boolean | null }) {
 const { data, error } = useFinanceData(simulationMode, 0)
 if (error) return <span style={{ fontSize: '14px', color: '#c9928c' }} title={error}>Could not load figures</span>
 if (!data) return <span style={{ fontSize: '14px', color: s.muted }}>Loading…</span>
 const w = windows()
 const today = sum(data.pays.filter(p => t(p.paid_at) >= w.dayStart), p => p.amount)
 const open7 = sum(data.upcoming.filter(u => u.date <= w.in7), u => u.open)
 return (
 <>
 <span style={{ fontSize: '22px', fontWeight: 500, color: s.text }}>{eur0(today)}</span>
 <span style={{ fontSize: '14px', color: s.muted }}>received today{open7 > 0 && <> · <span style={{ color: '#d4a07a', fontWeight: 500 }}>{eur0(open7)} open next 7 days</span></>}{simulationMode ? ' (Test data)' : ''}</span>
 </>
 )
}

const tile = { background: 'var(--glass)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 0, padding: '16px 16px' } as const
const lbl = { fontSize: '14px', color: s.muted, textTransform: 'uppercase', letterSpacing: '.08em' } as const
const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,.07)' } as const
const btn = { background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: s.muted, borderRadius: 0, padding: '6px 12px', cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit' } as const

function Kpis({ items, isMobile }: { items: Array<[string, string, string?, string?]>; isMobile: boolean }) {
 return (
 <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : `repeat(${items.length}, 1fr)`, gap: '16px', marginBottom: '28px' }}>
 {items.map(([l, v, c, sub]) => (
 <div key={l} style={tile}>
 <div style={lbl}>{l}</div>
 <div style={{ fontSize: '20px', fontWeight: 500, color: c ?? s.text, marginTop: '6px', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
 {sub && <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px' }}>{sub}</div>}
 </div>
 ))}
 </div>
 )
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
 return (
 <div style={{ marginBottom: '32px' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
 <div style={lbl}>{title}</div>
 {action}
 </div>
 {children}
 </div>
 )
}

function BookingNo({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
 return <button type="button" onClick={() => onOpen(id)} title="Open booking" style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', color: 'var(--text)', fontWeight: 500, background: 'transparent', border: '1px solid color-mix(in srgb, var(--text) 35%, transparent)', borderRadius: 0, padding: '0 6px', cursor: 'pointer', fontSize: '14px' }}>{id.slice(0, 8).toUpperCase()}</button>
}

function byMethod(pays: Pay[]) {
 const m: Record<string, { amount: number; n: number }> = {}
 for (const p of pays) { (m[p.method] ??= { amount: 0, n: 0 }).amount += p.amount; m[p.method].n++ }
 return Object.entries(m).sort((a, b) => b[1].amount - a[1].amount)
}

function MethodChips({ pays }: { pays: Pay[] }) {
 const list = byMethod(pays)
 if (list.length === 0) return <div style={{ fontSize: '14px', color: s.muted }}>No payments.</div>
 return (
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
 {list.map(([m, v]) => (
 <span key={m} style={{ fontSize: '14px', color: s.text, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 0, padding: '5px 12px' }}>
 {ML[m] ?? m} · <b>{eur2(v.amount)}</b> <span style={{ color: s.muted }}>({v.n})</span>
 </span>
 ))}
 </div>
 )
}

function Head({ text, sim, onRefresh }: { text: string; sim: boolean | null; onRefresh: () => void }) {
 return (
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
 <div style={{ fontSize: '14px', color: s.muted }}>{text} Moves between linked bookings are not counted as revenue.{sim ? ' (Test data)' : ''}</div>
 <button type="button" onClick={onRefresh} style={btn}> Refresh</button>
 </div>
 )
}

// ── Zeitraum: Tag / Monat / Jahr um ein Ankerdatum ──
const MODES: Array<[Mode, string]> = [['day', 'Day'], ['month', 'Month'], ['year', 'Year']]
const DAY_MS = 86_400_000
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const monthLabel = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

function period(mode: Mode, a: Date) {
 const y = a.getFullYear(), m = a.getMonth(), d = a.getDate()
 const now = new Date()
 const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
 const start = mode === 'day' ? new Date(y, m, d) : mode === 'month' ? new Date(y, m, 1) : new Date(y, 0, 1)
 const end = mode === 'day' ? new Date(y, m, d + 1) : mode === 'month' ? new Date(y, m + 1, 1) : new Date(y + 1, 0, 1)
 const current = start.getTime() <= now.getTime() && now.getTime() < end.getTime()
 // Ende des bereits vergangenen Teils (laufender Zeitraum: bis einschliesslich heute)
 const cut = Math.max(start.getTime(), Math.min(end.getTime(), tomorrow))
 const days = Math.max(1, Math.round((cut - start.getTime()) / DAY_MS))
 // Vergleichszeitraum davor; im laufenden Monat / Jahr nur dieselben Tage
 let pStart: Date, pEnd: Date, vsLabel: string, vsNote: string
 if (mode === 'day') {
 pStart = new Date(y, m, d - 1); pEnd = start; vsLabel = 'vs day before'; vsNote = dmy(pStart)
 } else if (mode === 'month') {
 pStart = new Date(y, m - 1, 1)
 const prevDays = new Date(y, m, 0).getDate()
 pEnd = current ? new Date(y, m - 1, Math.min(now.getDate(), prevDays) + 1) : start
 vsLabel = 'vs month before'; vsNote = current ? `same ${plural(days, 'day')}` : monthLabel(pStart)
 } else {
 pStart = new Date(y - 1, 0, 1)
 pEnd = current ? new Date(y - 1, now.getMonth(), now.getDate() + 1) : start
 vsLabel = 'vs year before'; vsNote = current ? `${y - 1} to same date` : String(y - 1)
 }
 const label = mode === 'day' ? `${a.toLocaleDateString('en-GB', { weekday: 'short' })} ${dmy(a)}` : mode === 'month' ? monthLabel(a) : String(y)
 return { start: start.getTime(), end: end.getTime(), cut, days, current, future: start.getTime() >= tomorrow, pStart: pStart.getTime(), pEnd: pEnd.getTime(), vsLabel, vsNote, label, yearStart: new Date(y, 0, 1).getTime(), y, m, tomorrow, now: now.getTime() }
}

/** Einen Zeitraum vor oder zurueck. Landet man im laufenden Monat / Jahr, steht der Anker auf heute. */
function shift(mode: Mode, a: Date, dir: 1 | -1): Date {
 const now = new Date()
 if (mode === 'day') return new Date(a.getFullYear(), a.getMonth(), a.getDate() + dir)
 const n = mode === 'month' ? new Date(a.getFullYear(), a.getMonth() + dir, 1) : new Date(a.getFullYear() + dir, 0, 1)
 const same = mode === 'month' ? n.getFullYear() === now.getFullYear() && n.getMonth() === now.getMonth() : n.getFullYear() === now.getFullYear()
 return same ? midnight(now) : n
}

function Overview({ simulationMode, who, onOpenBooking, isMobile }: { simulationMode: boolean | null; who: Who; onOpenBooking: (id: string) => void; isMobile: boolean }) {
 const [tick, setTick] = useState(0)
 const [mode, setMode] = useState<Mode>(() => {
 if (typeof window === 'undefined') return 'day'
 const v = localStorage.getItem('azd_finOverviewMode')
 return v === 'day' || v === 'month' || v === 'year' ? v : 'day'
 })
 const [anchor, setAnchor] = useState<Date>(() => midnight(new Date()))
 // Vergleich mit dem Vorjahr: per Haekchen ein- und ausschaltbar (Lucas 05.11.), Wahl bleibt im Browser gespeichert
 const [compare, setCompare] = useState<boolean>(() => { try { return typeof window !== 'undefined' && localStorage.getItem('azd_finCompare') === '1' } catch { return false } })
 const pickCompare = (on: boolean) => { setCompare(on); try { localStorage.setItem('azd_finCompare', on ? '1' : '0') } catch { /* Speichern ist nur Komfort */ } }
 const { data, error } = useLedger(simulationMode, anchor.getFullYear(), tick)
 // Jahresansicht: Buchungen nach Tauchtag fuer das gewaehlte Jahr und das Jahr davor (Vergleich pro Monat)
 const yr = anchor.getFullYear()
 const yoy = useCached(bkCache, mode === 'year' && simulationMode !== null ? `${simulationMode}:${yr}` : null,
 () => loadDiveBookings(Boolean(simulationMode), { from: `${yr - 1}-01-01`, to: `${yr}-12-31` }), tick)
 const p = useMemo(() => period(mode, anchor), [mode, anchor, data]) // eslint-disable-line react-hooks/exhaustive-deps

 const refresh = () => { ledgerCache.clear(); bkCache.clear(); cache.delete(String(simulationMode)); setTick(n => n + 1) }
 const pickMode = (m: Mode) => { setMode(m); try { localStorage.setItem('azd_finOverviewMode', m) } catch { /* Speichern ist nur Komfort */ } }
 const todayYmd = ymd(new Date())
 const isToday = mode === 'day' ? ymd(anchor) === todayYmd : p.current
 const arrow = (off: boolean) => ({ ...btn, padding: '6px 11px', fontSize: '15px', lineHeight: '16px', opacity: off ? 0.35 : 1, cursor: off ? 'default' : 'pointer' })

 const bar = (
 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
 {/* Ein Auswahlfeld statt dreier Knoepfe (Lucas 05.11.: weniger ist mehr) */}
 <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: s.muted }}>
 View
 <select value={mode} aria-label="View" onChange={e => pickMode(e.target.value as Mode)}
 style={{ background: 'var(--bg)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 0, color: s.text, fontSize: '14px', fontWeight: 500, fontFamily: 'inherit', padding: '7px 10px', cursor: 'pointer', colorScheme: 'dark' }}>
 {MODES.map(([m, l]) => <option key={m} value={m}>{l}</option>)}
 </select>
 </label>
 <button type="button" onClick={() => setAnchor(a => shift(mode, a, -1))} title={`Previous ${mode}`} aria-label={`Previous ${mode}`} style={arrow(false)}>‹</button>
 <div style={{ fontSize: '15px', fontWeight: 500, color: s.text, minWidth: isMobile ? '0' : '150px', textAlign: 'center' }}>{p.label}</div>
 <button type="button" disabled={p.current || p.future} onClick={() => setAnchor(a => shift(mode, a, 1))} title={`Next ${mode}`} aria-label={`Next ${mode}`} style={arrow(p.current || p.future)}>›</button>
 <DateField label="Pick a date" value={ymd(anchor)} max={todayYmd} onChange={v => { const [yy, mm, dd] = v.split('-').map(Number); if (yy && mm && dd) setAnchor(new Date(yy, mm - 1, dd)) }} />
 {!isToday && <button type="button" onClick={() => setAnchor(midnight(new Date()))} style={btn}>Back to today</button>}
 {mode !== 'day' && (
 <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '14px', color: compare ? s.text : s.muted, cursor: 'pointer', marginLeft: isMobile ? '0' : '6px', userSelect: 'none' }}>
 <input type="checkbox" checked={compare} onChange={e => pickCompare(e.target.checked)} style={{ width: '15px', height: '15px', accentColor: s.accent, cursor: 'pointer' }} />
 Compare with {yr - 1}
 </label>
 )}
 </div>
 )
 const head = <Head text="Money received and refunded (paid ledger entries) for the chosen day, month or year." sim={simulationMode} onRefresh={refresh} />

 if (error) return <div>{bar}{head}<div style={{ color: '#c9928c', fontSize: '14px' }}> Could not load figures: {error}</div></div>
 if (!data) return <div>{bar}{head}<div style={{ color: s.muted, fontSize: '14px' }}>Loading...</div></div>

 const inR = <T extends { paid_at: string }>(list: T[], a: number, b: number) => list.filter(x => { const ts = t(x.paid_at); return ts >= a && ts < b })
 const pays = inR(data.pays, p.start, p.end), refs = inR(data.refs, p.start, p.end)
 const inn = sum(pays, x => x.amount), out = sum(refs, x => x.amount), net = inn - out
 // Gleicher Zeitpunkt ein Jahr frueher
 const lastYear = (ts: number) => { const d = new Date(ts); return new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()).getTime() }
 const netIn = (a: number, b: number) => sum(inR(data.pays, a, b), x => x.amount) - sum(inR(data.refs, a, b), x => x.amount)
 // Monatsansicht mit Haekchen: Kachel vergleicht mit demselben Monat im Vorjahr statt mit dem Vormonat
 const cmpYear = compare && mode === 'month'
 const prevNet = cmpYear ? netIn(lastYear(p.start), lastYear(p.cut)) : netIn(p.pStart, p.pEnd)
 const vsLabel = cmpYear ? 'vs last year' : p.vsLabel
 const vsNote = cmpYear ? (p.current ? `same ${plural(p.days, 'day')} ${p.y - 1}` : monthLabel(new Date(lastYear(p.start)))) : p.vsNote
 const vs = prevNet > 0 ? Math.round((net - prevNet) / prevNet * 100) : null
 const ytd = sum(inR(data.pays, p.yearStart, p.cut), x => x.amount) - sum(inR(data.refs, p.yearStart, p.cut), x => x.amount)
 const money = mode === 'day' ? eur2 : eur0
 const sim = Boolean(simulationMode)
 const file = (name: string) => csvFileName(name, { from: ymd(new Date(p.start)), to: ymd(new Date(p.cut - DAY_MS / 2)) }, sim)

 const kpis: Array<[string, string, string?, string?]> = [
 ['Received', money(inn), '#b7c4b0', plural(pays.length, 'payment')],
 ['Refunded', money(out), out > 0 ? '#d4a07a' : s.text, plural(refs.length, 'refund')],
 ['Net', money(net), s.accent, mode === 'day' ? undefined : `avg ${eur0(Math.round(net / p.days))} / day`],
 [vsLabel, vs === null ? '—' : `${vs > 0 ? '+' : ''}${vs} %`, vs === null ? s.muted : vs >= 0 ? '#b7c4b0' : '#c9928c', `${vsNote}: ${money(prevNet)}`],
 ]
 if (mode !== 'year') kpis.push(['Year to date', eur0(ytd), s.text, `net, 01.01. to ${dmy(new Date(p.cut - DAY_MS / 2))}`])

 // Balken: Monat = pro Tag, Jahr = pro Monat. Kommende Tage / Monate grau, heute bzw. laufender Monat hervorgehoben.
 const buckets = mode === 'month'
 ? Array.from({ length: new Date(p.y, p.m + 1, 0).getDate() }, (_, i) => { const d = new Date(p.y, p.m, i + 1); return { a: d.getTime(), b: new Date(p.y, p.m, i + 2).getTime(), key: ymd(d), label: `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${dmy(d)}`, name: dmy(d) } })
 : mode === 'year'
 ? Array.from({ length: 12 }, (_, i) => { const d = new Date(p.y, i, 1); return { a: d.getTime(), b: new Date(p.y, i + 1, 1).getTime(), key: `${p.y}-${pad(i + 1)}`, label: monthLabel(d), name: monthLabel(d) } })
 : []
 const stats = buckets.map(k => { const bp = inR(pays, k.a, k.b), br = inR(refs, k.a, k.b); const i = sum(bp, x => x.amount), o = sum(br, x => x.amount); return { ...k, inn: i, out: o, net: i - o, n: bp.length, ly: compare ? netIn(lastYear(k.a), lastYear(k.b)) : 0, future: k.a >= p.tomorrow, mark: k.a <= p.now && p.now < k.b } })
 const lyTip = (k: { ly: number }): Array<[string, string]> => (compare ? [[`Net ${p.y - 1}`, eur2(k.ly)]] : [])
 const series: BarPoint[] = stats.map(k => ({ key: k.key, label: k.label, value: k.net, value2: compare ? k.ly : undefined, dim: k.future, mark: k.mark,
 tip: k.future ? [['Not yet', '—'], ...lyTip(k)] : [['Received', eur2(k.inn)], ['Refunded', eur2(k.out)], ['Net', eur2(k.net)], ...lyTip(k), ['Payments', String(k.n)]] }))
 const unit = mode === 'month' ? 'day' : 'month'
 const seriesCsv: Table = { headers: [mode === 'month' ? 'Day' : 'Month', 'Payments', 'Received', 'Refunded', 'Net', ...(compare ? [`Net ${p.y - 1}`] : [])], align: ['l', 'r', 'r', 'r', 'r', ...(compare ? ['r' as const] : [])],
 rows: stats.filter(k => !k.future).map(k => [k.name, k.n, { cents: k.inn }, { cents: k.out }, { cents: k.net }, ...(compare ? [{ cents: k.ly }] : [])]),
 total: ['Total', pays.length, { cents: inn }, { cents: out }, { cents: net }, ...(compare ? [{ cents: sum(stats.filter(k => !k.future), k => k.ly) }] : [])] }

 const prod: Record<string, { amount: number; bookings: Set<string> }> = {}
 for (const x of pays) { const k = x.product ?? 'Other'; (prod[k] ??= { amount: 0, bookings: new Set() }).amount += x.amount; prod[k].bookings.add(x.booking_id) }
 const prodList = Object.entries(prod).sort((a, b) => b[1].amount - a[1].amount)
 const prodCsv: Table = { headers: ['Product', 'Bookings', 'Received'], align: ['l', 'r', 'r'], rows: prodList.map(([name, v]) => [name, v.bookings.size, { cents: v.amount }]), total: ['Total', null, { cents: inn }] }
 const methodCsv: Table = { headers: ['Payment method', 'Payments', 'Received'], align: ['l', 'r', 'r'], rows: byMethod(pays).map(([m, v]) => [mName(m), v.n, { cents: v.amount }]), total: ['Total', pays.length, { cents: inn }] }

 // Tagesansicht: jede einzelne Zahlung und jeder Refund des Tages
 const moves = mode !== 'day' ? [] : [
 ...pays.map(x => ({ key: `p${x.id}`, ts: x.paid_at, kind: 'in' as const, amount: x.amount, method: x.method, booking_id: x.booking_id, customer: x.customer, product: x.product, by: who.id(x.recorded_by) })),
 ...refs.map(r => ({ key: `r${r.id}`, ts: r.paid_at, kind: 'out' as const, amount: r.amount, method: r.method, booking_id: r.booking_id, customer: r.customer, product: r.product, by: r.by ? who(r.by) : null })),
 ].sort((a, b) => b.ts.localeCompare(a.ts))
 const movesCsv: Table = {
 headers: ['Date', 'Time', 'Type', 'Customer', 'Product', 'Booking', 'Method', 'Recorded by', 'Amount'], align: ['l', 'l', 'l', 'l', 'l', 'l', 'l', 'l', 'r'],
 rows: moves.map(m => [dmy(new Date(m.ts)), hm(new Date(m.ts)), m.kind === 'in' ? 'Payment received' : 'Refund', m.customer ?? '', m.product ?? '', m.booking_id.slice(0, 8).toUpperCase(), mName(m.method), m.by ?? 'by system', { cents: m.kind === 'in' ? m.amount : -m.amount }]),
 total: ['Net', '', '', '', '', '', '', '', { cents: net }],
 }

 // Jahresvergleich wie in FareHarbor: gebuchter Wert pro Tauchmonat, gewaehltes Jahr neben dem Vorjahr.
 // Gleiche Zaehlweise wie Reports Monthly bookings (Stornos und offene Anfragen zaehlen nicht zum Wert).
 let yoyBlock: ReactNode = null
 if (mode === 'year') {
 if (yoy.error) yoyBlock = <div style={{ color: '#c9928c', fontSize: '14px' }}> Could not load bookings: {yoy.error}</div>
 else if (!yoy.data) yoyBlock = <div style={{ color: s.muted, fontSize: '14px' }}>Loading...</div>
 else {
 const y = p.y, md = p.current ? ymd(new Date(p.now)).slice(5) : '12-31'
 const cur = bookingsByBucket(yoy.data, { from: `${y}-01-01`, to: `${y}-12-31` }, 'dive', 'month')
 const prev = bookingsByBucket(yoy.data, { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }, 'dive', 'month')
 const curTo = bookingsByBucket(yoy.data, { from: `${y}-01-01`, to: `${y}-${md}` }, 'dive', 'year').totals.value
 const prevTo = bookingsByBucket(yoy.data, { from: `${y - 1}-01-01`, to: `${y - 1}-${md}` }, 'dive', 'year').totals.value
 const pct = (a: number, b: number) => (b > 0 ? Math.round((a - b) / b * 1000) / 10 : null)
 const pctText = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)} %`)
 const change = pct(curTo, prevTo)
 const months = cur.series.map((c, i) => ({ key: c.key, name: monthLabel(new Date(y, i, 1)).split(' ')[0], cur: c.value, prev: prev.series[i]?.value ?? 0, nCur: Number(cur.table.rows[i]?.[1] ?? 0), nPrev: Number(prev.table.rows[i]?.[1] ?? 0) }))
 const yoySeries: BarPoint[] = months.map((m, i) => ({ key: m.key, label: `${m.name} ${y}`, value: m.cur, value2: compare ? m.prev : undefined, mark: p.current && i === new Date(p.now).getMonth(),
 tip: compare ? [[String(y - 1), eur2(m.prev)], [String(y), eur2(m.cur)], ['Change', pctText(pct(m.cur, m.prev))], ['Bookings', `${m.nPrev} ${m.nCur}`]] : [['Booked value', eur2(m.cur)], ['Bookings', String(m.nCur)]] }))
 const yoyCsv: Table = compare
 ? { headers: ['Dive month', `Booked value ${y - 1}`, `Booked value ${y}`, 'Change', `Bookings ${y - 1}`, `Bookings ${y}`], align: ['l', 'r', 'r', 'r', 'r', 'r'],
 rows: months.map(m => [m.name, { cents: m.prev }, { cents: m.cur }, { pct: pct(m.cur, m.prev) }, m.nPrev, m.nCur]),
 total: ['Total', { cents: prev.totals.value }, { cents: cur.totals.value }, { pct: pct(cur.totals.value, prev.totals.value) }, prev.totals.bookings, cur.totals.bookings] }
 : { headers: ['Dive month', `Booked value ${y}`, `Bookings ${y}`], align: ['l', 'r', 'r'], rows: months.map(m => [m.name, { cents: m.cur }, m.nCur]), total: ['Total', { cents: cur.totals.value }, cur.totals.bookings] }
 yoyBlock = (
 <>
 <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap', margin: '2px 0 4px' }}>
 <span style={{ fontSize: '24px', fontWeight: 500, color: s.text, fontVariantNumeric: 'tabular-nums' }}>{eur2(cur.totals.value)}</span>
 {compare && <span style={{ fontSize: '14px', fontWeight: 500, padding: '3px 9px', borderRadius: 0, color: change === null ? s.muted : change >= 0 ? '#b7c4b0' : '#c9928c', background: change === null ? 'rgba(255,255,255,.06)' : change >= 0 ? 'rgba(183,196,176,.12)' : 'rgba(201,146,140,.12)' }}>
 {pctText(change)} vs {p.current ? 'same time last year' : String(y - 1)}
 </span>}
 </div>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '26px' }}>
 What was booked for each dive month of {y}: the price of the bookings, paid or not yet paid. Cancelled bookings and open requests are not counted.
 {!compare ? '' : p.current ? ` The comparison uses dive days from 01.01. to ${md.slice(3)}.${md.slice(0, 2)}. in both years (${eur2(curTo)} vs ${eur2(prevTo)}).` : ` ${y - 1}: ${eur2(prev.totals.value)}.`}
 </div>
 <BarChart series={yoySeries} height={150} legend={compare ? [String(y - 1), String(y)] : undefined} empty="No bookings in this period." hint={compare ? 'Move the mouse over a month to see both years.' : `Move the mouse over a month to see its numbers. Tick "Compare with ${y - 1}" above for the year before.`} />
 <div style={{ marginBottom: '18px' }}><CsvButton fileName={file(compare ? `booked-value-by-month-${y}-vs-${y - 1}` : `booked-value-by-month-${y}`)} table={yoyCsv} /></div>
 </>
 )
 }
 }

 return (
 <div>
 {bar}
 {head}
 <Kpis isMobile={isMobile} items={kpis} />
 {mode === 'year' && <Section title={`${p.y} booking total (booked value), by dive month`}>{yoyBlock}</Section>}
 {mode !== 'day' && (
 <Section title={`Money received (net) per ${unit}`} action={<CsvButton fileName={file(`net-per-${unit}`)} table={seriesCsv} />}>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '22px' }}>
 Money that really came in on each {unit}: payments received minus refunds paid out, by payment date.
 {mode === 'year' ? ' A booking paid in June for a dive in August counts in June here, and in August in the chart above.' : ''}
 </div>
 <BarChart tone="teal" series={series} legend={compare ? [String(p.y - 1), String(p.y)] : undefined} empty="No payments in this period." hint={`Move the mouse over a ${unit} to see its numbers.`} />
 </Section>
 )}
 <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr', gap: isMobile ? '0' : '24px' }}>
 <Section title="By product (received)" action={<CsvButton fileName={file('by-product')} table={prodCsv} />}>
 {prodList.length === 0 && <div style={{ fontSize: '14px', color: s.muted }}>No payments in this period.</div>}
 {prodList.map(([name, v]) => (
 <div key={name} style={row}>
 <span style={{ fontSize: '14px', color: s.muted }}>{name} <span style={{ fontSize: '14px' }}>· {plural(v.bookings.size, 'booking')}</span></span>
 <span style={{ fontSize: '14px', color: s.text, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{eur2(v.amount)}</span>
 </div>
 ))}
 </Section>
 <Section title="By payment method" action={<CsvButton fileName={file('by-payment-method')} table={methodCsv} />}><MethodChips pays={pays} /></Section>
 </div>
 {mode === 'day' && (
 <Section title="Payments and refunds on this day" action={<CsvButton fileName={file('day-movements')} table={movesCsv} />}>
 {moves.length === 0 && <div style={{ fontSize: '14px', color: s.muted, padding: '6px 0' }}>Nothing received or refunded on this day.</div>}
 {moves.map(m => (
 <div key={m.key} style={row}>
 <div style={{ minWidth: 0 }}>
 <div style={{ fontSize: '14px', color: s.text, fontWeight: 500 }}>{m.kind === 'in' ? 'Payment received' : 'Refund'}<span style={{ fontWeight: 400, color: s.muted, marginLeft: '8px', fontSize: '14px' }}>{m.customer ?? '—'}{m.product ? ` · ${m.product}` : ''}</span></div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px' }}>
 {new Date(m.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · Booking <BookingNo id={m.booking_id} onOpen={onOpenBooking} /> · {ML[m.method] ?? m.method} · {m.by ? ` ${m.by}` : ' by system'}
 </div>
 </div>
 <div style={{ fontSize: '14.5px', fontWeight: 500, color: m.kind === 'in' ? '#b7c4b0' : '#d4a07a', flexShrink: 0 }}>{m.kind === 'in' ? '+' : '−'}{eur2(m.amount)}</div>
 </div>
 ))}
 </Section>
 )}
 </div>
 )
}

function Upcoming({ simulationMode, onOpenBooking, isMobile }: { simulationMode: boolean | null; onOpenBooking: (id: string) => void; isMobile: boolean }) {
 const [tick, setTick] = useState(0)
 const { data, error } = useFinanceData(simulationMode, tick)
 const w = useMemo(() => windows(), [data]) // eslint-disable-line react-hooks/exhaustive-deps
 const refresh = () => { cache.delete(String(simulationMode)); setTick(n => n + 1) }
 const head = <Head text="Bookings in the next 14 days and what is still open." sim={simulationMode} onRefresh={refresh} />
 if (error) return <div>{head}<div style={{ color: '#c9928c', fontSize: '14px' }}> Could not load figures: {error}</div></div>
 if (!data) return <div>{head}<div style={{ color: s.muted, fontSize: '14px' }}>Loading...</div></div>

 const next7 = data.upcoming.filter(u => u.date <= w.in7)
 const openAll = sum(data.upcoming, u => u.open)
 const upcomingCsv: Table = {
 headers: ['Dive day', 'Customer', 'Product', 'Pax', 'Booking', 'Payment', 'Status', 'Booked value', 'Paid', 'Open'], align: ['l', 'l', 'l', 'r', 'l', 'l', 'l', 'r', 'r', 'r'],
 rows: data.upcoming.map(u => [dmy(new Date(`${u.date}T12:00:00`)), u.customer ?? '', u.product ?? '', u.pax, u.id.slice(0, 8).toUpperCase(), u.state ? PAYMENT_STATE_LABEL[u.state] : '', u.status, { cents: u.amount }, { cents: u.paid }, { cents: u.open }]),
 total: ['Total', '', '', sum(data.upcoming, u => u.pax), '', '', '', { cents: sum(data.upcoming, u => u.amount) }, { cents: sum(data.upcoming, u => u.paid) }, { cents: openAll }],
 }
 return (
 <div>
 {head}
 <Kpis isMobile={isMobile} items={[
 ['Next 7 days', `${next7.length}`, s.text, `booking${next7.length === 1 ? '' : 's'} · ${sum(next7, u => u.pax)} pax`],
 ['Booked value (7 d)', eur0(sum(next7, u => u.amount))],
 ['Open (7 d)', eur0(sum(next7, u => u.open)), sum(next7, u => u.open) > 0 ? '#d4a07a' : s.text],
 ['Open (14 d)', eur0(openAll), openAll > 0 ? '#d4a07a' : s.text, `${data.upcoming.length} booking${data.upcoming.length === 1 ? '' : 's'}`],
 ]} />
 <Section title="Bookings in the next 14 days" action={<CsvButton fileName={csvFileName('upcoming-bookings', { from: w.today, to: ymd(new Date(w.n.getFullYear(), w.n.getMonth(), w.n.getDate() + 14)) }, Boolean(simulationMode))} table={upcomingCsv} />}>
 {data.upcoming.length === 0 && <div style={{ fontSize: '14px', color: s.muted, padding: '6px 0' }}>No bookings in the next 14 days.</div>}
 {data.upcoming.map(u => (
 <div key={u.id} style={row}>
 <div style={{ minWidth: 0 }}>
 <div style={{ fontSize: '14px', color: s.text, fontWeight: 500 }}>
 {new Date(`${u.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}
 <span style={{ fontWeight: 400, color: s.muted, marginLeft: '8px', fontSize: '14px' }}>{u.customer ?? '—'}{u.product ? ` · ${u.product}` : ''} · {u.pax} pax</span>
 </div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
 <span>Booking <BookingNo id={u.id} onOpen={onOpenBooking} /></span>
 {u.state && <span style={{ color: PAYMENT_STATE_COLOR[u.state], fontWeight: 500 }}> {PAYMENT_STATE_LABEL[u.state]}</span>}
 <span>{u.status}</span>
 </div>
 </div>
 <div style={{ textAlign: 'right', flexShrink: 0 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: u.open > 0 ? '#d4a07a' : s.text, fontVariantNumeric: 'tabular-nums' }}>{u.open > 0 ? `${eur2(u.open)} open` : eur2(u.amount)}</div>
 <div style={{ fontSize: '14px', color: s.muted }}>paid {eur2(u.paid)} of {eur2(u.amount)}</div>
 </div>
 </div>
 ))}
 </Section>
 </div>
 )
}

export default function FinanceOverview({ tab, simulationMode, who, onOpenBooking, isMobile }: {
 tab: 'overview' | 'upcoming'
 simulationMode: boolean | null
 who: Who
 onOpenBooking: (id: string) => void
 isMobile: boolean
}) {
 return tab === 'overview'
 ? <Overview simulationMode={simulationMode} who={who} onOpenBooking={onOpenBooking} isMobile={isMobile} />
 : <Upcoming simulationMode={simulationMode} onOpenBooking={onOpenBooking} isMobile={isMobile} />
}
