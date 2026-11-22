import { supabase } from '@/components/pages/_shared'
import { methodKey, METHOD_LABEL, type Table } from '@/lib/financeReports'

// CSV-Tabellen fuer die bestehenden Finances-Ansichten (Pricing, Refunds). Lucas 05.11.2026:
// "Alle Statistiken und Tabellen will ich runterladen koennen."

const p2 = (n: number) => String(n).padStart(2, '0')
const dmy = (iso: string | null | undefined) => { if (!iso) return ''; const d = new Date(iso); return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}` }
const hm = (iso: string | null | undefined) => { if (!iso) return ''; const d = new Date(iso); return `${p2(d.getHours())}:${p2(d.getMinutes())}` }
const ref8 = (id: string) => id.slice(0, 8).toUpperCase()
const mName = (m: string | null | undefined) => METHOD_LABEL[methodKey(m)] ?? (m ?? '')
type Who = (e: string | null | undefined) => string
const person = (who: Who, e: string | null | undefined) => (e ? who(e) : '')

export function pricesTable(prices: Array<{ name: string; category: string; price_cents: number; is_placeholder: boolean; notes: string | null }>): Table {
 const list = [...prices].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
 return {
 headers: ['Category', 'Product', 'Price', 'Price not final', 'Notes'], align: ['l', 'l', 'r', 'l', 'l'],
 rows: list.map(p => [p.category, p.name, { cents: p.price_cents }, p.is_placeholder ? 'yes' : '', p.notes ?? '']),
 }
}

export function priceLogTable(log: Array<{ product_name: string; old_price_cents: number; new_price_cents: number; changed_by_email: string; changed_at: string }>, who: Who): Table {
 return {
 headers: ['Date', 'Time', 'Product', 'Old price', 'New price', 'Changed by'], align: ['l', 'l', 'l', 'r', 'r', 'l'],
 rows: log.map(e => [dmy(e.changed_at), hm(e.changed_at), e.product_name, { cents: e.old_price_cents }, { cents: e.new_price_cents }, person(who, e.changed_by_email)]),
 }
}

/** Offene Refund-Antraege. Zielkonten (auch maskiert) stehen bewusst nicht in der Datei. */
export function pendingRefundsTable(rows: Array<{ booking_id: string; amount: number; method: string; description: string; requested_at: string; requested_by_email: string | null
 booking: { customer_name: string | null; customer_email: string | null; phone: string | null; booking_date: string; product_name: string | null } }>, who: Who): Table {
 return {
 headers: ['Requested on', 'Customer', 'E-mail', 'Phone', 'Product', 'Dive day', 'Booking', 'Refund method', 'Amount', 'Reason', 'Requested by'], align: ['l', 'l', 'l', 'l', 'l', 'l', 'l', 'l', 'r', 'l', 'l'],
 rows: rows.map(r => [dmy(r.requested_at), r.booking.customer_name ?? '', r.booking.customer_email ?? '', r.booking.phone ?? '', r.booking.product_name ?? '',
 r.booking.booking_date ? dmy(`${r.booking.booking_date}T12:00:00`) : '', ref8(r.booking_id), mName(r.method), { cents: r.amount }, r.description ?? '', person(who, r.requested_by_email)]),
 total: ['Total', '', '', '', '', '', '', '', { cents: rows.reduce((t, r) => t + (r.amount ?? 0), 0) }, '', ''],
 }
}

export function pendingPaymentsTable(rows: Array<{ booking_id: string; amount: number; method: string; due_at: string | null; notes: string | null; created_at: string
 customer_name: string | null; product_name: string | null; booking_date: string | null }>): Table {
 return {
 headers: ['Recorded on', 'Customer', 'Product', 'Dive day', 'Booking', 'Method', 'Due', 'Note', 'Amount'], align: ['l', 'l', 'l', 'l', 'l', 'l', 'l', 'l', 'r'],
 rows: rows.map(r => [dmy(r.created_at), r.customer_name ?? '', r.product_name ?? '', r.booking_date ? dmy(`${r.booking_date}T12:00:00`) : '', ref8(r.booking_id), mName(r.method), dmy(r.due_at), r.notes ?? '', { cents: r.amount }]),
 total: ['Total', '', '', '', '', '', '', '', { cents: rows.reduce((t, r) => t + (r.amount ?? 0), 0) }],
 }
}

/**
 * Refund History als CSV: alle Zeilen zum aktuellen Filter (nicht nur die sichtbare Seite).
 * Filterlogik wie die Liste in Members.tsx (Suche nach Name/E-Mail/Produkt/Buchungsnummer/Beschreibung, Monat, Methode).
 */
export async function loadRefundHistoryTable(f: { sim: boolean; search: string; month: string; method: string }, who: Who): Promise<Table> {
 let searchOr: string | null = null
 if (f.search) {
 const q = f.search.replace(/[,()%*]/g, ' ').trim()
 const parts: string[] = [`description.ilike.%${q}%`]
 const { data: hit, error: hErr } = await supabase.from('bookings').select('id')
 .or(`customer_name.ilike.%${q}%,customer_email.ilike.%${q}%,product_name.ilike.%${q}%`).limit(150)
 if (hErr) throw new Error(`Search: ${hErr.message}`)
 const ids = (hit ?? []).map(x => x.id as string)
 if (/^[0-9a-f]{8}$/i.test(q)) {
 const lo = `${q.toLowerCase()}-0000-0000-0000-000000000000`, hi = `${q.toLowerCase()}-ffff-ffff-ffff-ffffffffffff`
 const { data: byNo } = await supabase.from('bookings').select('id').gte('id', lo).lte('id', hi).limit(20)
 ids.push(...(byNo ?? []).map(x => x.id as string))
 }
 if (ids.length) parts.push(`booking_id.in.(${[...new Set(ids)].join(',')})`)
 searchOr = parts.join(',')
 }
 type R = { id: string; booking_id: string; amount: number; method: string; status: string; description: string | null; requested_at: string; requested_by_email: string | null; authorized_by_email: string | null; paid_at: string | null; stripe_refund_id: string | null; notes: string | null }
 const rows: R[] = []
 for (let from = 0; ; from += 1000) {
 let q = supabase.from('booking_refunds')
 .select('id, booking_id, amount, method, status, description, requested_at, requested_by_email, authorized_by_email, paid_at, stripe_refund_id, notes')
 .neq('status', 'requested').eq('is_test', f.sim)
 if (f.method !== 'all') q = q.eq('method', f.method)
 if (searchOr) q = q.or(searchOr)
 if (f.month) {
 const [y, m] = f.month.split('-').map(Number)
 q = q.gte('paid_at', new Date(Date.UTC(y, m - 1, 1)).toISOString()).lt('paid_at', new Date(Date.UTC(y, m, 1)).toISOString())
 }
 const { data, error } = await q.order('paid_at', { ascending: false, nullsFirst: false }).order('id', { ascending: true }).range(from, from + 999)
 if (error) throw new Error(error.message)
 rows.push(...((data ?? []) as R[]))
 if (!data || data.length < 1000) break
 }
 const ids = [...new Set(rows.map(r => r.booking_id))]
 const bk = new Map<string, { customer_name: string | null; product_name: string | null }>()
 for (let i = 0; i < ids.length; i += 150) {
 const { data, error } = await supabase.from('bookings').select('id, customer_name, product_name').in('id', ids.slice(i, i + 150))
 if (error) throw new Error(`Bookings: ${error.message}`)
 for (const b of data ?? []) bk.set(b.id, b)
 }
 return {
 headers: ['Paid out on', 'Customer', 'Product', 'Booking', 'Refund method', 'Status', 'Amount', 'Reason', 'Requested by', 'Authorised by', 'Stripe refund', 'Notes'], align: ['l', 'l', 'l', 'l', 'l', 'l', 'r', 'l', 'l', 'l', 'l', 'l'],
 rows: rows.map(r => [dmy(r.paid_at ?? r.requested_at), bk.get(r.booking_id)?.customer_name ?? '', bk.get(r.booking_id)?.product_name ?? '', ref8(r.booking_id), mName(r.method), r.status,
 { cents: r.amount }, r.description ?? '', person(who, r.requested_by_email), person(who, r.authorized_by_email), r.stripe_refund_id ?? '', r.notes ?? '']),
 total: ['Total', '', '', '', '', '', { cents: rows.reduce((t, r) => t + (r.amount ?? 0), 0) }, '', '', '', '', ''],
 }
}
