'use client'
import { useEffect, useState } from 'react'
import { supabase, s } from '@/components/pages/_shared'
import { auditFromClient } from '@/lib/auditClient'
import DateField from '@/components/finance/DateField'
import { sendPaymentRequest } from '@/components/booking/PaymentRequestRetry'

// Pflichtschritt nach dem Anlegen einer Front-Office-Buchung mit Cash / Transfer / Revolut (Cláudia, Lucas 06.11.2026):
// Das Team muss sofort sagen, was mit dem Geld ist — ganz bezahlt, teilweise bezahlt oder noch nicht bezahlt.
// bezahlter Teil -> booking_payments "paid" + /api/payment-registered (Deposit-Regel, Status, Mail an den Gast)
// offener Rest -> booking_payments "pending" (erwartete Zahlung, optional mit Datum) -> spaeter "Mark as received"
// Bei Split-Buchungen eine Zeile pro Gast, mit Abkuerzung fuer "alle gleich".
// Gleiche Schreibwege wie "Mark as fully paid" und "+ Add payment" im Buchungs-Popup (FrontOfficeBookings).

type Choice = 'full' | 'part' | 'none'
type Row = { id: string; name: string; product: string; amount: number; paid: number; currency: string; method: string }
type Pick = { choice: Choice | null; part: string }

const METHOD: Record<string, string> = { cash: 'cash', bank: 'bank_transfer', bank_transfer: 'bank_transfer', revolut: 'revolut' }
const LABEL: Record<string, string> = { cash: 'Cash', bank_transfer: 'Transfer', revolut: 'Revolut' }
const eur = (c: number) => `€${(c / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const toCents = (v: string) => { const n = Math.round(parseFloat(v.replace(',', '.')) * 100); return Number.isFinite(n) ? n : NaN }
const OPTIONS: Array<[Choice, string]> = [['full', 'Paid in full'], ['part', 'Paid in part'], ['none', 'Not paid yet']]

// sendRequest: nach dem Speichern die Zahlungsaufforderung per Mail schicken, wenn bei Transfer / Revolut etwas offen bleibt
// (nur direkt nach dem Anlegen; beim Nachholen unter Action needed nicht, dort kann der Gast schon eine haben).
// Die Mail nennt den offenen Betrag und, bei einer Teilzahlung, was schon bezahlt ist.
// requestDeposit: Haekchen "Charge 50% deposit now" — die Mail fordert dann die Haelfte an.
export type RequestFailure = { id: string; name: string; method: string | null; error: string }
export default function PaymentDecision({ bookingIds, onDone, compact, sendRequest, requestDeposit }: { bookingIds: string[]; onDone: (note: string, failedRequests: RequestFailure[]) => void; compact?: boolean; sendRequest?: boolean; requestDeposit?: boolean }) {
 const [rows, setRows] = useState<Row[] | null>(null)
 const [loadErr, setLoadErr] = useState<string | null>(null)
 const [picks, setPicks] = useState<Record<string, Pick>>({})
 const [due, setDue] = useState('')
 const [busy, setBusy] = useState(false)
 const [err, setErr] = useState<string | null>(null)
 // Bereits gespeicherte Gaeste (falls das Speichern mittendrin scheitert, wird nichts doppelt gebucht)
 const [saved, setSaved] = useState<Record<string, string>>({})
 const key = bookingIds.join(',')

 useEffect(() => {
 let alive = true
 ;(async () => {
 const [b, p] = await Promise.all([
 supabase.from('bookings').select('id, customer_name, product_name, amount, currency, payment_method').in('id', bookingIds),
 supabase.from('booking_payments').select('booking_id, amount, status').in('booking_id', bookingIds).eq('status', 'paid'),
 ])
 if (!alive) return
 if (b.error || p.error) { setLoadErr(`${(b.error ?? p.error)!.code ?? ''} ${(b.error ?? p.error)!.message}`.trim()); return }
 const paid = new Map<string, number>()
 for (const x of p.data ?? []) paid.set(x.booking_id as string, (paid.get(x.booking_id as string) ?? 0) + ((x.amount as number) ?? 0))
 const by = new Map((b.data ?? []).map(x => [x.id as string, x]))
 // Reihenfolge wie angelegt (Gast 1, Gast 2, …)
 const list = bookingIds.map(id => by.get(id)).filter((x): x is NonNullable<typeof x> => Boolean(x)).map(x => ({
 id: x.id as string, name: (x.customer_name as string) || 'Guest', product: (x.product_name as string) || '', amount: (x.amount as number) ?? 0,
 paid: paid.get(x.id as string) ?? 0, currency: (x.currency as string) ?? 'eur', method: METHOD[(x.payment_method as string) ?? ''] ?? 'cash',
 }))
 if (list.length === 0) { setLoadErr('Booking not found'); return }
 setRows(list)
 })()
 return () => { alive = false }
 }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

 if (loadErr) return <div style={{ fontSize: '14px', color: 'var(--text)' }}>Could not load the booking for the payment status: {loadErr}</div>
 if (!rows) return <div style={{ fontSize: '14px', color: s.muted }}>Loading…</div>

 const openOf = (r: Row) => Math.max(0, r.amount - r.paid)
 const pickOf = (id: string): Pick => picks[id] ?? { choice: null, part: '' }
 const set = (id: string, p: Partial<Pick>) => setPicks(m => ({ ...m, [id]: { ...pickOf(id), ...p } }))
 const setAll = (choice: Choice) => setPicks(Object.fromEntries(rows.map(r => [r.id, { choice, part: '' }])))
 // Was wird fuer diesen Gast gebucht? null = Angabe fehlt oder ist ungueltig
 const plan = (r: Row): { pay: number; rest: number } | null => {
 const p = pickOf(r.id), open = openOf(r)
 if (saved[r.id] || open === 0) return { pay: 0, rest: 0 }
 if (p.choice === 'full') return { pay: open, rest: 0 }
 if (p.choice === 'none') return { pay: 0, rest: open }
 if (p.choice === 'part') { const c = toCents(p.part); return Number.isNaN(c) || c <= 0 || c >= open ? null : { pay: c, rest: open - c } }
 return null
 }
 const plans = rows.map(plan)
 const ready = plans.every(Boolean)
 const anyRest = plans.some(x => x && x.rest > 0)
 const missing = rows.filter((r, i) => !plans[i]).map(r => (pickOf(r.id).choice === 'part' ? `${r.name}: amount received (more than 0, less than ${eur(openOf(r))})` : `${r.name}: choose one`))

 const list = rows
 async function save() {
 if (!ready || busy) return
 setBusy(true); setErr(null)
 const done = { ...saved }
 const failed: RequestFailure[] = []
 try {
 const { data: auth } = await supabase.auth.getUser()
 const uid = auth.user?.id ?? null, email = auth.user?.email ?? null
 const token = (await supabase.auth.getSession()).data.session?.access_token ?? ''
 const now = new Date().toISOString()
 for (let i = 0; i < list.length; i++) {
 const r = list[i], pl = plans[i]!
 if (done[r.id] || (pl.pay === 0 && pl.rest === 0)) continue
 const label = LABEL[r.method] ?? r.method
 const log = async (action: string, description: string) => {
 await supabase.from('booking_changelog').insert({ booking_id: r.id, changed_by_email: email, action, field: null, old_value: null, new_value: null, description })
 void auditFromClient(supabase, { bookingId: r.id, action, description })
 }
 let note = ''
 if (pl.pay > 0) {
 const { error } = await supabase.from('booking_payments').insert({
 booking_id: r.id, amount: pl.pay, currency: r.currency, status: 'paid', method: r.method, paid_at: now, recorded_by: uid,
 notes: pl.rest === 0 ? 'Paid in full when the booking was created' : 'Part payment when the booking was created',
 })
 if (error) throw new Error(`${r.name}: payment not saved (${error.code ?? ''} ${error.message})`)
 await log('payment_added', `Payment recorded: ${eur(pl.pay)} via ${label} (payment status set when the booking was created)`)
 // Deposit-Regel + Status + Mail an den Gast, wie bei jeder anderen Front-Office-Zahlung
 try {
 const res = await fetch('/api/payment-registered', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ booking_id: r.id, amount_cents: pl.pay, method_label: label, request_follows: Boolean(sendRequest) && pl.rest > 0 && (r.method === 'bank_transfer' || r.method === 'revolut') }) })
 const d = await res.json().catch(() => ({}))
 note = !res.ok || !d.ok ? `email not sent (HTTP ${res.status}: ${d.error ?? 'unknown error'})` : d.mail === 'booking_confirmation' ? 'booking confirmation sent' : d.mail === 'payment_received' ? 'payment email sent' : 'no email'
 } catch (e) { note = `email not sent (${e instanceof Error ? e.message : String(e)})` }
 if (pl.rest === 0) {
 const { error: uErr } = await supabase.from('bookings').update({ status: 'confirmed', paid_at: now, updated_at: now }).eq('id', r.id).in('status', ['pending', 'confirmed'])
 if (uErr) throw new Error(`${r.name}: payment saved, but the booking status was not updated (${uErr.code ?? ''} ${uErr.message})`)
 }
 }
 if (pl.rest > 0) {
 const { error } = await supabase.from('booking_payments').insert({
 booking_id: r.id, amount: pl.rest, currency: r.currency, status: 'pending', method: r.method, recorded_by: uid,
 due_at: due ? new Date(`${due}T12:00:00`).toISOString() : null, notes: 'Payment expected (set when the booking was created)',
 })
 if (error) throw new Error(`${r.name}: open amount not saved (${error.code ?? ''} ${error.message})`)
 await log('payment_added', `Payment expected: ${eur(pl.rest)} via ${label}${due ? ` (until ${due.slice(8, 10)}.${due.slice(5, 7)}.${due.slice(0, 4)})` : ''}`)
 // Zahlungsaufforderung an den Gast: nur Transfer / Revolut, ueber den offenen Betrag (Server rechnet Preis minus bezahlt)
 if (sendRequest && (r.method === 'bank_transfer' || r.method === 'revolut')) {
 // Ergebnis steht im Buchungsverlauf (sent / failed); ein Fehlschlag erscheint zusaetzlich unter Action needed
 const rq = await sendPaymentRequest(r.id, r.method === 'revolut' ? 'revolut' : 'bank', Boolean(requestDeposit) && pl.pay === 0)
 if (!rq.ok) failed.push({ id: r.id, name: r.name, method: r.method === 'revolut' ? 'revolut' : 'bank', error: rq.text })
 note = note ? `${note}, ${rq.text}` : rq.text
 }
 }
 done[r.id] = `${r.name}: ${pl.pay > 0 ? `${eur(pl.pay)} paid` : ''}${pl.pay > 0 && pl.rest > 0 ? ', ' : ''}${pl.rest > 0 ? `${eur(pl.rest)} open` : ''}${note ? ` (${note})` : ''}`
 setSaved({ ...done })
 }
 onDone(Object.values(done).join(' · ') || 'Nothing open', failed)
 } catch (e) {
 setSaved({ ...done })
 setErr(e instanceof Error ? e.message : String(e))
 }
 setBusy(false)
 }

 const chip = (on: boolean) => ({ padding: '8px 13px', borderRadius: 0, border: `1px solid ${on ? s.accent : 'rgba(255,255,255,.14)'}`, background: on ? 'color-mix(in srgb, var(--text) 12%, transparent)' : 'transparent', color: on ? s.accent : s.muted, fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const })
 return (
 <div style={{ background: 'transparent', border: '1px solid var(--line)', borderRadius: 0, padding: compact ? '14px' : '18px', textAlign: 'left' }}>
 <div style={{ fontSize: '15px', fontWeight: 500, color: s.text, marginBottom: '4px' }}>What happened with the payment?</div>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '14px', lineHeight: 1.5 }}>
 Please answer now. Money you received is recorded as paid and the guest gets the payment email. What is still open is recorded as expected, so it can be marked as received later.
 </div>
 {rows.length > 1 && (
 <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
 <span style={{ fontSize: '14px', color: s.muted }}>Same for all guests:</span>
 <button type="button" onClick={() => setAll('full')} style={chip(rows.every(r => pickOf(r.id).choice === 'full'))}>All paid in full</button>
 <button type="button" onClick={() => setAll('none')} style={chip(rows.every(r => pickOf(r.id).choice === 'none'))}>All not paid yet</button>
 </div>
 )}
 {rows.map(r => {
 const p = pickOf(r.id), open = openOf(r), c = toCents(p.part)
 return (
 <div key={r.id} style={{ padding: '12px 0', borderTop: '1px solid rgba(255,255,255,.08)' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
 <span style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>{r.name}<span style={{ fontWeight: 400, color: s.muted, marginLeft: '8px', fontSize: '14px' }}>{r.product} · {LABEL[r.method] ?? r.method}</span></span>
 <span style={{ fontSize: '14px', fontWeight: 500, color: s.text, fontVariantNumeric: 'tabular-nums' }}>{eur(open)}</span>
 </div>
 {saved[r.id] ? <div style={{ fontSize: '14px', color: 'var(--text)' }}>Saved: {saved[r.id]}</div>
 : open === 0 ? <div style={{ fontSize: '14px', color: s.muted }}>Nothing open.</div>
 : (
 <>
 <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
 {OPTIONS.map(([k, l]) => <button key={k} type="button" aria-pressed={p.choice === k} onClick={() => set(r.id, { choice: k })} style={chip(p.choice === k)}>{l}</button>)}
 </div>
 {p.choice === 'part' && (
 <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '10px', fontSize: '14px', color: s.muted }}>
 <label htmlFor={`pd-${r.id}`}>Received now (€)</label>
 <input id={`pd-${r.id}`} type="text" inputMode="decimal" value={p.part} placeholder="e.g. 50" onChange={e => set(r.id, { part: e.target.value })}
 style={{ width: '110px', background: 'var(--bg)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 0, color: s.text, fontSize: '14px', fontFamily: 'inherit', padding: '7px 10px' }} />
 {!Number.isNaN(c) && c > 0 && c < open && <span>still open: <b style={{ color: 'var(--text)' }}>{eur(open - c)}</b></span>}
 </div>
 )}
 </>
 )}
 </div>
 )
 })}
 {anyRest && (
 <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', padding: '12px 0', borderTop: '1px solid rgba(255,255,255,.08)', fontSize: '14px', color: s.muted }}>
 <span>Open amount expected until (optional)</span>
 <DateField label="Expected until" value={due} onChange={setDue} />
 {due && <button type="button" onClick={() => setDue('')} style={{ background: 'none', border: 'none', color: s.muted, textDecoration: 'underline', cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit', padding: 0 }}>no date</button>}
 </div>
 )}
 {err && <div style={{ fontSize: '14px', color: 'var(--text)', margin: '6px 0 10px' }}>Not saved: {err}. What was saved before stays saved. Please try again.</div>}
 <button type="button" disabled={!ready || busy} onClick={save}
 style={{ width: '100%', marginTop: '8px', padding: '12px', borderRadius: 0, border: 'none', background: ready && !busy ? s.accent : 'rgba(255,255,255,.08)', color: ready && !busy ? 'var(--bg)' : s.muted, fontWeight: 500, fontSize: '14px', cursor: ready && !busy ? 'pointer' : 'default', fontFamily: 'inherit' }}>
 {busy ? 'Saving…' : ready ? 'Save payment status' : `Missing: ${missing.join(' · ')}`}
 </button>
 </div>
 )
}
