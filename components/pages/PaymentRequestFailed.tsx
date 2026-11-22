'use client'

/**
 * Finances Action needed: Buchungen, bei denen die Zahlungsaufforderung (Transfer / Revolut) nicht rausging
 * und seitdem keine erfolgreich verschickt wurde. Der Gast hat dann keine Zahlungsdaten.
 * Quelle: Buchungsverlauf (letzter Eintrag "payment_request_failed" / "payment_request_sent" je Buchung).
 * Ein Eintrag verschwindet, sobald eine Aufforderung erfolgreich rausging, die Buchung bezahlt oder storniert ist,
 * oder wenn jemand die Meldung verwirft ("Dismiss": Eintrag "payment_request_dismissed" im Buchungsverlauf, mit Name).
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase, s } from '@/components/pages/_shared'
import { sendPaymentRequest } from '@/components/booking/PaymentRequestRetry'
import { auditFromClient } from '@/lib/auditClient'

type Row = { id: string; customer_name: string | null; customer_email: string | null; product_name: string | null; booking_date: string | null; amount: number; payment_method: string | null; failedAt: string; error: string }
const eur = (c: number) => `€${(c / 100).toFixed(2)}`
const dmy = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '—')

export default function PaymentRequestFailed({ sandbox, onCount, onOpenBooking }: { sandbox: boolean | null; onCount?: (n: number) => void; onOpenBooking: (id: string) => void }) {
 const [rows, setRows] = useState<Row[]>([])
 const [loading, setLoading] = useState(true)
 const [err, setErr] = useState<string | null>(null)
 const [busy, setBusy] = useState<string | null>(null)
 const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
 const [ask, setAsk] = useState<string | null>(null) // Buchung, fuer die "Dismiss" gerade bestaetigt werden soll
 // Andere E-Mail-Adresse je Buchung (falls die hinterlegte immer scheitert) und ob sie an der Buchung gespeichert werden soll
 const [alt, setAlt] = useState<Record<string, { open: boolean; email: string; save: boolean }>>({})
 const altOf = (r: Row) => alt[r.id] ?? { open: false, email: '', save: false }
 const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

 const load = useCallback(async () => {
 if (sandbox === null) return
 setLoading(true); setErr(null)
 const { data, error } = await supabase.from('booking_changelog').select('booking_id, action, description, changed_at')
 .in('action', ['payment_request_failed', 'payment_request_sent', 'payment_request_dismissed']).order('changed_at', { ascending: false }).limit(1000)
 if (error) { setErr(`${error.code ?? ''} ${error.message}`.trim()); setLoading(false); return }
 // Neuester Eintrag je Buchung entscheidet
 const last = new Map<string, { action: string; description: string | null; changed_at: string }>()
 for (const c of data ?? []) if (!last.has(c.booking_id as string)) last.set(c.booking_id as string, { action: c.action as string, description: (c.description as string) ?? null, changed_at: c.changed_at as string })
 const ids = [...last.entries()].filter(([, v]) => v.action === 'payment_request_failed').map(([k]) => k)
 if (ids.length === 0) { setRows([]); onCount?.(0); setLoading(false); return }
 const { data: bks, error: bErr } = await supabase.from('bookings')
 .select('id, customer_name, customer_email, product_name, booking_date, amount, payment_method, payment_state, status, is_test').in('id', ids)
 if (bErr) { setErr(`${bErr.code ?? ''} ${bErr.message}`.trim()); setLoading(false); return }
 const list: Row[] = (bks ?? [])
 .filter(b => (b.is_test === true) === (sandbox === true) && b.status !== 'cancelled' && (b.payment_state === 'unpaid' || b.payment_state === 'deposit'))
 .map(b => ({ id: b.id as string, customer_name: (b.customer_name as string) ?? null, customer_email: (b.customer_email as string) ?? null, product_name: (b.product_name as string) ?? null, booking_date: (b.booking_date as string) ?? null,
 amount: (b.amount as number) ?? 0, payment_method: (b.payment_method as string) ?? null, failedAt: last.get(b.id as string)!.changed_at, error: last.get(b.id as string)!.description ?? '' }))
 .sort((a, b) => b.failedAt.localeCompare(a.failedAt))
 setRows(list); onCount?.(list.length)
 setLoading(false)
 }, [sandbox, onCount])
 // Laden beim Oeffnen und bei Wechsel Sandbox / Production (gleiches Muster wie PendingPayments)
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(() => { void load() }, [load])

 async function again(r: Row, toEmail?: string, saveOnBooking?: boolean) {
 setBusy(r.id); setMsg(null)
 const to = toEmail?.trim().toLowerCase()
 const res = await sendPaymentRequest(r.id, r.payment_method, false, to)
 let extra = ''
 // Neue Adresse nur uebernehmen, wenn die Mail damit wirklich rausging
 if (res.ok && to && saveOnBooking && to !== (r.customer_email ?? '').toLowerCase()) {
 const { error } = await supabase.from('bookings').update({ customer_email: to, updated_at: new Date().toISOString() }).eq('id', r.id)
 if (error) extra = ` The new address was NOT saved on the booking (${error.code ?? ''} ${error.message}).`
 else {
 const email = (await supabase.auth.getUser()).data.user?.email ?? null
 const description = `Guest email changed from ${r.customer_email ?? '(none)'} to ${to} (payment request could not be delivered to the old address)`
 await supabase.from('booking_changelog').insert({ booking_id: r.id, changed_by_email: email, action: 'profile_updated', field: 'customer_email', old_value: r.customer_email, new_value: to, description })
 void auditFromClient(supabase, { bookingId: r.id, action: 'profile_updated', description, field: 'customer_email', oldVal: r.customer_email ?? undefined, newVal: to })
 extra = ' The new address is now saved on the booking.'
 }
 }
 setMsg({ ok: res.ok, text: `${r.customer_name ?? 'Guest'}: ${res.text}.${extra}` })
 if (res.ok) setAlt(m => ({ ...m, [r.id]: { open: false, email: '', save: false } }))
 setBusy(null)
 void load()
 }

 // Meldung verwerfen: bleibt im Buchungsverlauf nachvollziehbar, der Gast hat weiterhin keine Zahlungsdaten
 async function dismiss(r: Row) {
 setBusy(r.id); setMsg(null)
 const email = (await supabase.auth.getUser()).data.user?.email ?? null
 const description = 'Notice "payment request not sent" dismissed in Finances. No payment request was sent, the guest still has no payment details.'
 const { error } = await supabase.from('booking_changelog').insert({ booking_id: r.id, changed_by_email: email, action: 'payment_request_dismissed', field: null, old_value: null, new_value: null, description })
 if (error) { setMsg({ ok: false, text: `${r.customer_name ?? 'Guest'}: not dismissed (${error.code ?? ''} ${error.message})` }); setBusy(null); return }
 void auditFromClient(supabase, { bookingId: r.id, action: 'payment_request_dismissed', description })
 setMsg({ ok: true, text: `${r.customer_name ?? 'Guest'}: notice dismissed. It stays in the booking log.` })
 setAsk(null); setBusy(null)
 void load()
 }

 if (!loading && !err && rows.length === 0 && !msg) return null
 return (
 <div style={{ marginBottom: '28px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)', marginBottom: '4px' }}>Payment request not sent{rows.length ? ` (${rows.length})` : ''}</div>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '12px', lineHeight: 1.55 }}>
 The email with the payment details (bank transfer or Revolut) did not go out, so the guest cannot pay yet. Send it again, or open the booking and check the email address. If sending keeps failing, give the guest the details another way and dismiss the notice.
 </div>
 {msg && <div style={{ fontSize: '14px', marginBottom: '10px', color: msg.ok ? 'var(--text)' : 'var(--text)' }}>{msg.text}</div>}
 {loading ? <div style={{ fontSize: '14px', color: s.muted }}>Loading…</div>
 : err ? <div style={{ fontSize: '14px', color: 'var(--text)' }}>Could not load this list: {err}</div>
 : rows.map(r => (
 <div key={r.id} style={{ background: 'transparent', border: '1px solid var(--line)', borderRadius: 0, padding: '14px 18px', marginBottom: '10px' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
 <div style={{ minWidth: 0 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>{r.customer_name ?? '—'}</div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px' }}>
 {r.product_name ?? '—'} · dive day {dmy(r.booking_date)} · {r.payment_method === 'revolut' ? 'Revolut' : 'Transfer'} · {r.customer_email ?? 'no email address'}
 </div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px' }}>
 failed {dmy(r.failedAt.slice(0, 10))} ·{' '}
 <button type="button" onClick={() => onOpenBooking(r.id)} title="Open booking" style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', fontSize: '14px', fontWeight: 500, color: s.accent, textDecoration: 'underline' }}>{r.id.slice(0, 8).toUpperCase()}</button>
 </div>
 </div>
 <div style={{ textAlign: 'right' }}>
 <div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text)' }}>{eur(r.amount)}</div>
 <div style={{ fontSize: '14px', color: s.muted }}>booking total</div>
 </div>
 </div>
 {r.error && <div style={{ fontSize: '14px', color: s.text, padding: '8px 10px', marginTop: '8px', background: 'rgba(255,255,255,.03)', borderRadius: 0, borderLeft: '3px solid var(--line)' }}>{r.error}</div>}
 <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
 <button type="button" disabled={busy === r.id} onClick={() => again(r)} style={{ flex: '1 1 240px', padding: '10px', borderRadius: 0, border: '1px solid color-mix(in srgb, var(--text) 40%, transparent)', background: 'color-mix(in srgb, var(--text) 8%, transparent)', color: s.accent, fontWeight: 500, fontSize: '14px', cursor: busy === r.id ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
 {busy === r.id ? 'Working…' : 'Send payment request again'}
 </button>
 <button type="button" disabled={busy === r.id} onClick={() => setAlt(m => ({ ...m, [r.id]: { ...altOf(r), open: !altOf(r).open } }))} aria-expanded={altOf(r).open} style={{ padding: '10px 16px', borderRadius: 0, border: `1px solid ${altOf(r).open ? 'color-mix(in srgb, var(--text) 50%, transparent)' : 'rgba(255,255,255,.15)'}`, background: 'transparent', color: altOf(r).open ? s.accent : s.muted, fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>Other email address</button>
 {ask !== r.id && <button type="button" disabled={busy === r.id} onClick={() => setAsk(r.id)} style={{ padding: '10px 16px', borderRadius: 0, border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: s.muted, fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>Dismiss</button>}
 </div>
 {altOf(r).open && (
 <div style={{ marginTop: '10px', padding: '12px', borderRadius: 0, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.12)', fontSize: '14px', color: s.muted }}>
 <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
 <label htmlFor={`alt-${r.id}`}>Send the payment request to</label>
 <input id={`alt-${r.id}`} type="email" inputMode="email" autoComplete="off" value={altOf(r).email} placeholder="other email address of the guest"
 onChange={e => setAlt(m => ({ ...m, [r.id]: { ...altOf(r), email: e.target.value } }))}
 style={{ flex: '1 1 240px', minWidth: 0, background: 'var(--bg)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 0, color: s.text, fontSize: '14px', fontFamily: 'inherit', padding: '8px 10px' }} />
 <button type="button" disabled={busy === r.id || !validEmail(altOf(r).email)} onClick={() => again(r, altOf(r).email, altOf(r).save)}
 style={{ padding: '8px 14px', borderRadius: 0, border: '1px solid color-mix(in srgb, var(--text) 40%, transparent)', background: 'color-mix(in srgb, var(--text) 8%, transparent)', color: validEmail(altOf(r).email) ? s.accent : s.muted, fontWeight: 500, fontSize: '14px', cursor: validEmail(altOf(r).email) && busy !== r.id ? 'pointer' : 'default', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Send to this address</button>
 </div>
 <label style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px', cursor: 'pointer' }}>
 <input type="checkbox" checked={altOf(r).save} onChange={e => setAlt(m => ({ ...m, [r.id]: { ...altOf(r), save: e.target.checked } }))} style={{ width: '15px', height: '15px', accentColor: s.accent }} />
 Also save it as the guest email on the booking, so later emails go there too (only if this email goes out)
 </label>
 {altOf(r).email.trim() !== '' && !validEmail(altOf(r).email) && <div style={{ color: 'var(--text)', marginTop: '8px' }}>This does not look like an email address yet.</div>}
 </div>
 )}
 {ask === r.id && (
 <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: 0, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.12)', fontSize: '14px', color: s.text, display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
 <span style={{ flex: '1 1 260px' }}>Dismiss this notice? No email is sent. The guest still has no payment details, so give them another way. It stays in the booking log.</span>
 <button type="button" disabled={busy === r.id} onClick={() => dismiss(r)} style={{ padding: '8px 14px', borderRadius: 0, border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)', fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>Yes, dismiss</button>
 <button type="button" onClick={() => setAsk(null)} style={{ padding: '8px 14px', borderRadius: 0, border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: s.muted, fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
 </div>
 )}
 </div>
 ))}
 </div>
 )
}
