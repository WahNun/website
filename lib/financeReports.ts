// Finances → Reports: reine Rechenlogik (kein React, kein Supabase), damit sie testbar bleibt.
// Plan und Definitionen: Projekt-Doc claude/plan-finances-reports-2026-11-05.md (Lucas 05.11.2026).
//  - Sales = eingegangenes Geld (bezahlte Ledger-Zeilen minus ausgezahlte Refunds), nach Zahlungsdatum.
//  - Bookings = Buchungen nach Tauchtag, umschaltbar auf Buchungsdatum ("created").
//  - Kategorie-Statistik: eine Zahlung wird anteilig nach dem Wert der Positionen verteilt.
// Tagesgrenzen = Azoren-Zeit, unabhaengig vom Browser.

export const AZ_TZ = 'Atlantic/Azores'
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: AZ_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** ISO-Zeitstempel → Kalendertag auf den Azoren (YYYY-MM-DD). */
export function azDay(iso: string | Date): string {
  return dayFmt.format(typeof iso === 'string' ? new Date(iso) : iso)
}
const pad = (n: number) => String(n).padStart(2, '0')
const utc = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
const fromUtc = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
export function addDays(ymd: string, n: number): string { const d = utc(ymd); d.setUTCDate(d.getUTCDate() + n); return fromUtc(d) }

export type Period = { from: string; to: string } // beide inklusive, YYYY-MM-DD
export type PresetId = 'today' | 'week' | 'month' | 'last_month' | 'year'
export const PRESETS: Array<[PresetId, string]> = [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['last_month', 'Last month'], ['year', 'This year']]

export function presetPeriod(id: PresetId, today: string): Period {
  const d = utc(today), y = d.getUTCFullYear(), m = d.getUTCMonth()
  if (id === 'today') return { from: today, to: today }
  if (id === 'week') { const dow = (d.getUTCDay() + 6) % 7; const from = addDays(today, -dow); return { from, to: addDays(from, 6) } }
  if (id === 'month') return { from: fromUtc(new Date(Date.UTC(y, m, 1))), to: fromUtc(new Date(Date.UTC(y, m + 1, 0))) }
  if (id === 'last_month') return { from: fromUtc(new Date(Date.UTC(y, m - 1, 1))), to: fromUtc(new Date(Date.UTC(y, m, 0))) }
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}
export const validPeriod = (p: Period) => /^\d{4}-\d{2}-\d{2}$/.test(p.from) && /^\d{4}-\d{2}-\d{2}$/.test(p.to) && p.from <= p.to
export const inPeriod = (ymd: string, p: Period) => ymd >= p.from && ymd <= p.to
export function eachDay(p: Period): string[] { const out: string[] = []; for (let d = p.from; d <= p.to && out.length < 800; d = addDays(d, 1)) out.push(d); return out }
export function eachMonth(p: Period): string[] {
  const out: string[] = []; let y = Number(p.from.slice(0, 4)), m = Number(p.from.slice(5, 7))
  const end = p.to.slice(0, 7)
  for (let k = `${y}-${pad(m)}`; k <= end && out.length < 120; k = `${y}-${pad(m)}`) { out.push(k); m++; if (m > 12) { m = 1; y++ } }
  return out
}
export function eachYear(p: Period): string[] { const out: string[] = []; for (let y = Number(p.from.slice(0, 4)); y <= Number(p.to.slice(0, 4)) && out.length < 60; y++) out.push(String(y)); return out }
/** Staff-Ansichten: europaeisches Datum. */
export const fmtDay = (ymd: string) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}.${ymd.slice(0, 4)}`
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const fmtMonth = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const weekday = (ymd: string) => WD[utc(ymd).getUTCDay()]
// Zeitraster der Sales- und Bookings-Reports: Tag, Monat oder Jahr
export type Bucket = 'day' | 'month' | 'year'
const bucketKeys = (p: Period, b: Bucket) => (b === 'day' ? eachDay(p) : b === 'month' ? eachMonth(p) : eachYear(p))
export const bucketOf = (ymd: string, b: Bucket) => (b === 'day' ? ymd : b === 'month' ? ymd.slice(0, 7) : ymd.slice(0, 4))
const bucketLabel = (k: string, b: Bucket) => (b === 'day' ? `${weekday(k)} ${fmtDay(k)}` : b === 'month' ? fmtMonth(k) : k)
const bucketHead = (b: Bucket) => (b === 'day' ? 'Day' : b === 'month' ? 'Month' : 'Year')
/** Ein Balken / eine Zeile im Zeitraster; `key` = Tag (YYYY-MM-DD), Monat (YYYY-MM) oder Jahr. */
export type Series = Array<{ key: string; label: string; value: number }>

// ── Positionen einer Buchung ─────────────────────────────────────────────────
export type PriceRow = { id: string; name: string; category: string; kind?: string | null }
export type Line = { name: string; category: string; cents: number; qty: number }
export type BookingMoney = { product_name: string | null; group_size: number | null; amount: number | null; booking_extras: unknown; insurance_amount: number | null }

export const CATEGORY_LABEL: Record<string, string> = {
  dives: 'Dives', entry: 'Entry level', specialty: 'Specialties', pro: 'Pro', ecology: 'Ecology', excursion: 'Excursions',
  equipment: 'Equipment', addon: 'Add-ons', insurance: 'Insurance', other: 'Other',
}
const ADDON_CATEGORIES = new Set(['equipment', 'addon', 'insurance'])
const normCat = (c: string | null | undefined) => (c === 'equipment-legacy' ? 'equipment' : c && CATEGORY_LABEL[c] ? c : 'other')

export function priceIndex(prices: PriceRow[]): Map<string, PriceRow> {
  const m = new Map<string, PriceRow>()
  for (const p of prices) { m.set(`n:${p.name.trim().toLowerCase()}`, p); m.set(`i:${p.id}`, p) }
  return m
}
export function categoryOf(productName: string | null | undefined, idx: Map<string, PriceRow>): string {
  return normCat(idx.get(`n:${(productName ?? '').trim().toLowerCase()}`)?.category)
}
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
type ExtraItem = { name?: unknown; quantity?: unknown; total_cents?: unknown }

/** Hauptprodukt + Extras (Equipment, Add-ons, Versicherung). Der Buchungsbetrag enthaelt die Extras. */
export function bookingLines(b: BookingMoney, idx: Map<string, PriceRow>): Line[] {
  const ex = (b.booking_extras && typeof b.booking_extras === 'object' ? b.booking_extras : {}) as { equipment?: unknown; addons?: unknown; insurance?: unknown }
  const extras: Line[] = []
  const list = (v: unknown, category: string) => {
    for (const it of (Array.isArray(v) ? v : []) as ExtraItem[]) {
      if (!it || typeof it !== 'object') continue
      extras.push({ name: String(it.name ?? 'Extra'), category, cents: Math.max(0, num(it.total_cents)), qty: Math.max(1, num(it.quantity)) })
    }
  }
  list(ex.equipment, 'equipment')
  list(ex.addons, 'addon')
  const ins = ex.insurance as { name?: unknown; guests?: unknown; total_cents?: unknown } | null | undefined
  if (ins && typeof ins === 'object' && num(ins.total_cents) > 0) extras.push({ name: String(ins.name ?? 'Insurance'), category: 'insurance', cents: num(ins.total_cents), qty: Math.max(1, num(ins.guests)) })
  else if (num(b.insurance_amount) > 0) extras.push({ name: 'Insurance', category: 'insurance', cents: num(b.insurance_amount), qty: 1 })
  const extrasSum = extras.reduce((t, l) => t + l.cents, 0)
  const main: Line = { name: b.product_name ?? 'Unknown product', category: categoryOf(b.product_name, idx), cents: Math.max(0, num(b.amount) - extrasSum), qty: Math.max(1, num(b.group_size)) }
  return [main, ...extras]
}

/** Betrag anteilig auf Gewichte verteilen; Rundungsrest geht auf die groesste Position, die Summe stimmt immer. */
export function allocate(amount: number, weights: number[]): number[] {
  if (weights.length === 0) return []
  const sign = amount < 0 ? -1 : 1, a = Math.abs(Math.round(amount))
  let w = weights.map(x => Math.max(0, x))
  let tot = w.reduce((t, x) => t + x, 0)
  if (tot <= 0) { w = w.map(() => 1); tot = w.length }
  const shares = w.map(x => Math.floor(a * x / tot))
  const rest = a - shares.reduce((t, x) => t + x, 0)
  let big = 0
  for (let i = 1; i < w.length; i++) if (w[i] > w[big]) big = i
  shares[big] += rest
  return shares.map(x => x * sign)
}

// ── Tabellen ────────────────────────────────────────────────────────────────
export type Cell = string | number | null | { cents: number } | { pct: number | null }
export type Table = { headers: string[]; align: Array<'l' | 'r'>; rows: Cell[][]; total?: Cell[] }
const eurC = (cents: number): Cell => ({ cents })

// ── Sales ───────────────────────────────────────────────────────────────────
export type Pay = { amount: number; method: string; paid_at: string; user: string | null; lines: Line[] }
export type Ref = { amount: number; method: string; paid_at: string; user: string | null; lines: Line[] }

/** Zahlarten aus Zahlungen (card, bank_transfer) und Refunds (stripe, bank) auf einen Nenner bringen. */
export function methodKey(m: string | null | undefined): string {
  const x = (m ?? '').toLowerCase()
  if (x === 'stripe' || x === 'card') return 'card'
  if (x === 'bank' || x === 'bank_transfer') return 'bank_transfer'
  return x || 'other'
}
export const METHOD_LABEL: Record<string, string> = { card: 'Card / Stripe', cash: 'Cash', bank_transfer: 'Bank transfer', revolut: 'Revolut', mb_way: 'MB WAY', on_arrival: 'On arrival', other: 'Other' }

type SalesAgg = { payments: number; received: number; refunds: number; refunded: number }
const emptySales = (): SalesAgg => ({ payments: 0, received: 0, refunds: 0, refunded: 0 })
const salesRow = (label: Cell, a: SalesAgg): Cell[] => [label, a.payments, eurC(a.received), a.refunds, eurC(a.refunded), eurC(a.received - a.refunded)]
function sumSales(list: SalesAgg[]): SalesAgg { const t = emptySales(); for (const a of list) { t.payments += a.payments; t.received += a.received; t.refunds += a.refunds; t.refunded += a.refunded } return t }

export function salesByBucket(pays: Pay[], refs: Ref[], p: Period, bucket: Bucket): { table: Table; series: Series; keys: string[] } {
  const keys = bucketKeys(p, bucket)
  const m = new Map(keys.map(k => [k, emptySales()]))
  const keyOf = (iso: string) => { const d = azDay(iso); return inPeriod(d, p) ? bucketOf(d, bucket) : null }
  for (const x of pays) { const k = keyOf(x.paid_at); const a = k && m.get(k); if (a) { a.payments++; a.received += x.amount } }
  for (const x of refs) { const k = keyOf(x.paid_at); const a = k && m.get(k); if (a) { a.refunds++; a.refunded += x.amount } }
  const label = (k: string) => bucketLabel(k, bucket)
  return {
    table: {
      headers: [bucketHead(bucket), 'Payments', 'Received', 'Refunds', 'Refunded', 'Net'], align: ['l', 'r', 'r', 'r', 'r', 'r'],
      rows: keys.map(k => salesRow(label(k), m.get(k)!)), total: salesRow('Total', sumSales([...m.values()])),
    },
    series: keys.map(k => { const a = m.get(k)!; return { key: k, label: label(k), value: a.received - a.refunded } }), keys,
  }
}

const SYSTEM_USER = 'Online / automatic'
export function salesByUser(pays: Pay[], refs: Ref[], p: Period): Table {
  const m = new Map<string, SalesAgg>()
  const get = (u: string | null) => { const k = u ?? SYSTEM_USER; let a = m.get(k); if (!a) { a = emptySales(); m.set(k, a) } return a }
  for (const x of pays) if (inPeriod(azDay(x.paid_at), p)) { const a = get(x.user); a.payments++; a.received += x.amount }
  for (const x of refs) if (inPeriod(azDay(x.paid_at), p)) { const a = get(x.user); a.refunds++; a.refunded += x.amount }
  const list = [...m.entries()].sort((a, b) => b[1].received - a[1].received || a[0].localeCompare(b[0]))
  const t = sumSales(list.map(x => x[1]))
  return {
    headers: ['User', 'Payments taken', 'Received', 'Refunds authorised', 'Refunded'], align: ['l', 'r', 'r', 'r', 'r'],
    rows: list.map(([u, a]) => [u, a.payments, eurC(a.received), a.refunds, eurC(a.refunded)]),
    total: ['Total', t.payments, eurC(t.received), t.refunds, eurC(t.refunded)],
  }
}

function shareTable(first: string, m: Map<string, SalesAgg>, label: (k: string) => string, withCounts: boolean): Table {
  const list = [...m.entries()].sort((a, b) => (b[1].received - b[1].refunded) - (a[1].received - a[1].refunded) || a[0].localeCompare(b[0]))
  const t = sumSales(list.map(x => x[1])), net = t.received - t.refunded
  const pct = (a: SalesAgg): Cell => ({ pct: net > 0 ? (a.received - a.refunded) / net * 100 : null })
  const row = (l: string, a: SalesAgg, share: Cell): Cell[] => withCounts
    ? [l, a.payments, eurC(a.received), a.refunds, eurC(a.refunded), eurC(a.received - a.refunded), share]
    : [l, eurC(a.received), eurC(a.refunded), eurC(a.received - a.refunded), share]
  return {
    headers: withCounts ? [first, 'Payments', 'Received', 'Refunds', 'Refunded', 'Net', 'Share of net'] : [first, 'Received', 'Refunded', 'Net', 'Share of net'],
    align: withCounts ? ['l', 'r', 'r', 'r', 'r', 'r', 'r'] : ['l', 'r', 'r', 'r', 'r'],
    rows: list.map(([k, a]) => row(label(k), a, pct(a))), total: row('Total', t, { pct: net > 0 ? 100 : null }),
  }
}
export function revenueByMethod(pays: Pay[], refs: Ref[], p: Period): Table {
  const m = new Map<string, SalesAgg>()
  const get = (k: string) => { let a = m.get(k); if (!a) { a = emptySales(); m.set(k, a) } return a }
  for (const x of pays) if (inPeriod(azDay(x.paid_at), p)) { const a = get(methodKey(x.method)); a.payments++; a.received += x.amount }
  for (const x of refs) if (inPeriod(azDay(x.paid_at), p)) { const a = get(methodKey(x.method)); a.refunds++; a.refunded += x.amount }
  return shareTable('Payment method', m, k => METHOD_LABEL[k] ?? k, true)
}
export function revenueByCategory(pays: Pay[], refs: Ref[], p: Period): Table {
  const m = new Map<string, SalesAgg>()
  const get = (k: string) => { let a = m.get(k); if (!a) { a = emptySales(); m.set(k, a) } return a }
  const spread = (amount: number, lines: Line[], add: (a: SalesAgg, v: number) => void) => {
    const ls = lines.length ? lines : [{ name: 'Unknown', category: 'other', cents: 1, qty: 1 }]
    allocate(amount, ls.map(l => l.cents)).forEach((v, i) => { if (v !== 0) add(get(ls[i].category), v) })
  }
  for (const x of pays) if (inPeriod(azDay(x.paid_at), p)) spread(x.amount, x.lines, (a, v) => { a.received += v })
  for (const x of refs) if (inPeriod(azDay(x.paid_at), p)) spread(x.amount, x.lines, (a, v) => { a.refunded += v })
  return shareTable('Category', m, k => CATEGORY_LABEL[k] ?? k, false)
}
/** Eingegangenes Geld je Produkt / Extra. Zahlungen und Refunds werden wie bei der Kategorie anteilig auf die Positionen der Buchung verteilt. */
export function salesByItem(pays: Pay[], refs: Ref[], p: Period): Table {
  const m = new Map<string, SalesAgg & { name: string; category: string }>()
  const get = (l: Line) => { const k = `${l.category}|${l.name.trim().toLowerCase()}`; let a = m.get(k); if (!a) { a = { ...emptySales(), name: l.name.trim(), category: l.category }; m.set(k, a) } return a }
  const spread = (amount: number, lines: Line[], add: (a: SalesAgg, v: number) => void) => {
    const ls = lines.length ? lines : [{ name: 'Unknown', category: 'other', cents: 1, qty: 1 }]
    allocate(amount, ls.map(l => l.cents)).forEach((v, i) => { if (v !== 0) add(get(ls[i]), v) })
  }
  for (const x of pays) if (inPeriod(azDay(x.paid_at), p)) spread(x.amount, x.lines, (a, v) => { a.received += v; a.payments++ })
  for (const x of refs) if (inPeriod(azDay(x.paid_at), p)) spread(x.amount, x.lines, (a, v) => { a.refunded += v; a.refunds++ })
  const list = [...m.values()].sort((a, b) => (b.received - b.refunded) - (a.received - a.refunded) || a.name.localeCompare(b.name))
  const t = sumSales(list), net = t.received - t.refunded
  return {
    headers: ['Item', 'Category', 'Payments', 'Received', 'Refunded', 'Net', 'Share of net'], align: ['l', 'l', 'r', 'r', 'r', 'r', 'r'],
    rows: list.map(a => [a.name, CATEGORY_LABEL[a.category] ?? a.category, a.payments, eurC(a.received), eurC(a.refunded), eurC(a.received - a.refunded), { pct: net > 0 ? (a.received - a.refunded) / net * 100 : null }]),
    total: ['Total', '', null, eurC(t.received), eurC(t.refunded), eurC(net), { pct: net > 0 ? 100 : null }],
  }
}

// ── Bookings ────────────────────────────────────────────────────────────────
export type Bk = {
  id: string; booking_date: string | null; created_at: string; pax: number; amount: number; status: string
  request_state: string | null; origin: string | null; parent: string | null; creator: string | null; lines: Line[]
}
export type Basis = 'dive' | 'created'
export const isCancelled = (b: Bk) => b.status === 'cancelled'
/** Offene Anfrage (Low Season): noch keine Buchung, haelt keinen Platz. */
export const isOpenRequest = (b: Bk) => !isCancelled(b) && (b.request_state === 'requested' || b.request_state === 'approved')
/** Nachgebuchte Extras (Kind-Buchung mit Equipment/Versicherung/Add-on) zaehlen zum Wert, aber nicht als eigene Buchung oder Person. */
export const isAddonChild = (b: Bk) => Boolean(b.parent) && ADDON_CATEGORIES.has(b.lines[0]?.category ?? '')
export const bookingDay = (b: Bk, basis: Basis): string | null => (basis === 'dive' ? b.booking_date : azDay(b.created_at))

type BkAgg = { bookings: number; pax: number; value: number; cancelled: number; requests: number }
const emptyBk = (): BkAgg => ({ bookings: 0, pax: 0, value: 0, cancelled: 0, requests: 0 })
function addBk(a: BkAgg, b: Bk) {
  if (isCancelled(b)) { if (!isAddonChild(b)) a.cancelled++; return }
  if (isOpenRequest(b)) { a.requests++; return }
  a.value += b.amount
  if (!isAddonChild(b)) { a.bookings++; a.pax += b.pax }
}
const sumBk = (list: BkAgg[]): BkAgg => { const t = emptyBk(); for (const a of list) { t.bookings += a.bookings; t.pax += a.pax; t.value += a.value; t.cancelled += a.cancelled; t.requests += a.requests } return t }

export function bookingsByBucket(bks: Bk[], p: Period, basis: Basis, bucket: Bucket): { table: Table; series: Series; keys: string[]; totals: BkAgg } {
  const keys = bucketKeys(p, bucket)
  const m = new Map(keys.map(k => [k, emptyBk()]))
  for (const b of bks) { const d = bookingDay(b, basis); if (!d || !inPeriod(d, p)) continue; const a = m.get(bucketOf(d, bucket)); if (a) addBk(a, b) }
  const label = (k: string) => bucketLabel(k, bucket)
  const row = (l: string, a: BkAgg): Cell[] => [l, a.bookings, a.pax, eurC(a.value), a.cancelled, a.requests]
  const totals = sumBk([...m.values()])
  return {
    table: { headers: [bucketHead(bucket), 'Bookings', 'Pax', 'Booked value', 'Cancelled', 'Open requests'], align: ['l', 'r', 'r', 'r', 'r', 'r'], rows: keys.map(k => row(label(k), m.get(k)!)), total: row('Total', totals) },
    series: keys.map(k => ({ key: k, label: label(k), value: m.get(k)!.value })), keys, totals,
  }
}

export function bookingsByItem(bks: Bk[], p: Period, basis: Basis): Table {
  const m = new Map<string, { name: string; category: string; bookings: number; qty: number; value: number }>()
  for (const b of bks) {
    const d = bookingDay(b, basis)
    if (!d || !inPeriod(d, p) || isCancelled(b) || isOpenRequest(b)) continue
    for (const l of b.lines) {
      if (l.cents === 0 && l !== b.lines[0]) continue
      const k = `${l.category}|${l.name.trim().toLowerCase()}`
      let a = m.get(k); if (!a) { a = { name: l.name.trim(), category: l.category, bookings: 0, qty: 0, value: 0 }; m.set(k, a) }
      a.bookings++; a.qty += l.qty; a.value += l.cents
    }
  }
  const list = [...m.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
  return {
    headers: ['Item', 'Category', 'Bookings', 'Quantity', 'Booked value'], align: ['l', 'l', 'r', 'r', 'r'],
    rows: list.map(a => [a.name, CATEGORY_LABEL[a.category] ?? a.category, a.bookings, a.qty, eurC(a.value)]),
    total: ['Total', '', null, null, eurC(list.reduce((t, a) => t + a.value, 0))],
  }
}

export function creatorLabel(b: Bk): string {
  if (b.creator) return b.creator
  const o = (b.origin ?? '').toLowerCase()
  if (o === 'website') return 'Website (online)'
  if (o === 'chatbot' || o === 'chat') return 'Chatbot (online)'
  if (o === 'front_office') return 'Front Office (creator not recorded)'
  return 'Unknown'
}
export function bookingsByUser(bks: Bk[], p: Period, basis: Basis): Table {
  const m = new Map<string, BkAgg>()
  for (const b of bks) { const d = bookingDay(b, basis); if (!d || !inPeriod(d, p)) continue; const k = creatorLabel(b); let a = m.get(k); if (!a) { a = emptyBk(); m.set(k, a) } addBk(a, b) }
  const list = [...m.entries()].sort((a, b) => b[1].bookings - a[1].bookings || b[1].value - a[1].value || a[0].localeCompare(b[0]))
  const t = sumBk(list.map(x => x[1]))
  const row = (l: string, a: BkAgg): Cell[] => [l, a.bookings, a.pax, eurC(a.value), a.cancelled, a.requests]
  return { headers: ['Created by', 'Bookings', 'Pax', 'Booked value', 'Cancelled', 'Open requests'], align: ['l', 'r', 'r', 'r', 'r', 'r'], rows: list.map(([u, a]) => row(u, a)), total: row('Total', t) }
}

// ── Occupancy ───────────────────────────────────────────────────────────────
export type Sess = { date: string; session: string; seats: number; booking_id: string }
export type Capacity = { am: number; pm: number; night: number }
const SESSION_LABEL: Record<string, string> = { am: 'Morning', pm: 'Afternoon', night: 'Night' }
const SESSION_ORDER: Record<string, number> = { am: 0, pm: 1, night: 2 }

export function occupancy(sessions: Sess[], cap: Capacity, p: Period): { table: Table; summary: Table; seats: number; capacity: number; trips: number } {
  const m = new Map<string, { date: string; session: string; seats: number; bookings: Set<string> }>()
  for (const x of sessions) {
    if (!inPeriod(x.date, p) || !(x.session in SESSION_ORDER)) continue
    const k = `${x.date}|${x.session}`
    let a = m.get(k); if (!a) { a = { date: x.date, session: x.session, seats: 0, bookings: new Set() }; m.set(k, a) }
    a.seats += x.seats; a.bookings.add(x.booking_id)
  }
  const list = [...m.values()].filter(a => a.seats > 0).sort((a, b) => a.date.localeCompare(b.date) || SESSION_ORDER[a.session] - SESSION_ORDER[b.session])
  const capOf = (s: string) => cap[s as keyof Capacity] ?? 0
  const seats = list.reduce((t, a) => t + a.seats, 0), capacity = list.reduce((t, a) => t + capOf(a.session), 0)
  const pct = (s: number, c: number): Cell => ({ pct: c > 0 ? s / c * 100 : null })
  // Durchschnitt je Session-Art (Morning / Afternoon / Night) und ueber alle gefahrenen Sessions
  const avg = (label: string, ls: typeof list): Cell[] => {
    const st = ls.reduce((t, a) => t + a.seats, 0), cp = ls.reduce((t, a) => t + capOf(a.session), 0)
    return [label, ls.length, st, cp, pct(st, cp), ls.length ? Math.round(st / ls.length * 10) / 10 : null]
  }
  const kinds = Object.keys(SESSION_ORDER).filter(k => list.some(a => a.session === k))
  return {
    summary: {
      headers: ['Session', 'Sessions run', 'Seats booked', 'Seats available', 'Average occupancy', 'Average guests per session'], align: ['l', 'r', 'r', 'r', 'r', 'r'],
      rows: kinds.map(k => avg(SESSION_LABEL[k] ?? k, list.filter(a => a.session === k))), total: avg('All sessions', list),
    },
    table: {
      headers: ['Day', 'Session', 'Seats booked', 'Seats available', 'Occupancy', 'Bookings'], align: ['l', 'l', 'r', 'r', 'r', 'r'],
      rows: list.map(a => [`${weekday(a.date)} ${fmtDay(a.date)}`, SESSION_LABEL[a.session] ?? a.session, a.seats, capOf(a.session), pct(a.seats, capOf(a.session)), a.bookings.size]),
      total: ['Total', `${list.length} session${list.length === 1 ? '' : 's'}`, seats, capacity, pct(seats, capacity), null],
    },
    seats, capacity, trips: list.length,
  }
}

// Kurse: Schueler pro Tag gegen das Tageskontingent der Instructors (capacity_quota, wie das Dashboard-Widget "Course load")
export type CourseSess = { date: string; students: number; booking_id: string }
export function courseOccupancy(rows: CourseSess[], quotaOf: (ymd: string) => number, p: Period): { table: Table; students: number; quota: number; days: number } {
  const m = new Map<string, { students: number; bookings: Set<string> }>()
  for (const x of rows) {
    if (!inPeriod(x.date, p)) continue
    let a = m.get(x.date); if (!a) { a = { students: 0, bookings: new Set() }; m.set(x.date, a) }
    // Eine Buchung zaehlt pro Tag einmal, auch wenn sie an dem Tag mehrere Sessions hat
    if (!a.bookings.has(x.booking_id)) { a.bookings.add(x.booking_id); a.students += x.students }
  }
  const list = [...m.entries()].filter(([, a]) => a.students > 0).sort((a, b) => a[0].localeCompare(b[0]))
  const students = list.reduce((t, [, a]) => t + a.students, 0), quota = list.reduce((t, [d]) => t + quotaOf(d), 0)
  const pct = (s: number, c: number): Cell => ({ pct: c > 0 ? s / c * 100 : null })
  return {
    table: {
      headers: ['Day', 'Students', 'Instructor capacity', 'Occupancy', 'Bookings'], align: ['l', 'r', 'r', 'r', 'r'],
      rows: list.map(([d, a]) => [`${weekday(d)} ${fmtDay(d)}`, a.students, quotaOf(d), pct(a.students, quotaOf(d)), a.bookings.size]),
      total: ['Total', students, quota, pct(students, quota), null],
    },
    students, quota, days: list.length,
  }
}

// ── CSV ─────────────────────────────────────────────────────────────────────
// Semikolon als Trenner, Komma als Dezimalzeichen (Excel in Portugal oeffnet das direkt). Das BOM setzt der Download.
function csvCell(c: Cell): string {
  if (c === null || c === undefined) return ''
  if (typeof c === 'number') return Number.isInteger(c) ? String(c) : c.toFixed(2).replace('.', ',')
  if (typeof c === 'object') {
    if ('cents' in c) return (c.cents / 100).toFixed(2).replace('.', ',')
    return c.pct === null ? '' : c.pct.toFixed(1).replace('.', ',')
  }
  // Text, der wie eine Formel beginnt, entschaerfen (Namen und Notizen kommen von Gaesten)
  const safe = /^[=+\-@\t\r]/.test(c) ? `'${c}` : c
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}
export function toCsv(t: Table): string {
  const lines = [t.headers.map(csvCell).join(';'), ...t.rows.map(r => r.map(csvCell).join(';'))]
  if (t.total) lines.push(t.total.map(csvCell).join(';'))
  return lines.join('\r\n') + '\r\n'
}
export const csvFileName = (report: string, p: Period | null, sandbox: boolean) =>
  `azd-${report}${p ? `-${p.from}_${p.to}` : ''}-${sandbox ? 'sandbox' : 'production'}.csv`
