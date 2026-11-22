'use client'

/**
 * Finances Action needed: Front-Office-Buchungen (Cash / Transfer / Revolut), bei denen nach dem Anlegen
 * niemand gesagt hat, was mit dem Geld ist (kein bezahlter und kein erwarteter Betrag erfasst).
 * Auffangnetz fuer den Pflichtschritt nach dem Anlegen (components/booking/PaymentDecision), falls jemand
 * den Browser-Tab vorher schliesst. Die Entscheidung kann hier direkt nachgeholt werden.
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase, s } from '@/components/pages/_shared'
import PaymentDecision from '@/components/booking/PaymentDecision'

type Row = { id: string; customer_name: string | null; product_name: string | null; booking_date: string | null; amount: number; payment_method: string | null; created_at: string; created_by_email: string | null }
const eur = (c: number) => `€${(c / 100).toFixed(2)}`
const dmy = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '—')
const METHOD: Record<string, string> = { cash: 'Cash', bank: 'Transfer', revolut: 'Revolut' }

export default function PaymentStatusMissing({ sandbox, onCount, onOpenBooking, who }: {
 sandbox: boolean | null
 onCount?: (n: number) => void
 onOpenBooking: (id: string) => void
 who: (email: string | null | undefined) => string
}) {
 const [rows, setRows] = useState<Row[]>([])
 const [loading, setLoading] = useState(true)
 const [err, setErr] = useState<string | null>(null)
 const [open, setOpen] = useState<string | null>(null)
 const [msg, setMsg] = useState<string | null>(null)

 const load = useCallback(async () => {
 if (sandbox === null) return
 setLoading(true); setErr(null)
 const { data, error } = await supabase.from('bookings')
 .select('id, customer_name, product_name, booking_date, amount, payment_method, created_at, created_by_email')
 .eq('is_test', sandbox).eq('origin', 'front_office').eq('payment_state', 'unpaid').is('request_state', null)
 .in('payment_method', ['cash', 'bank', 'revolut']).in('status', ['pending', 'confirmed', 'completed']).gt('amount', 0)
 .order('created_at', { ascending: false }).limit(300)
 if (error) { setErr(`${error.code ?? ''} ${error.message}`.trim()); setLoading(false); return }
 const ids = (data ?? []).map(b => b.id as string)
 const has = new Set<string>()
 for (let i = 0; i < ids.length; i += 150) {
 const { data: pays, error: pErr } = await supabase.from('booking_payments').select('booking_id').in('booking_id', ids.slice(i, i + 150)).in('status', ['paid', 'pending'])
 if (pErr) { setErr(`${pErr.code ?? ''} ${pErr.message}`.trim()); setLoading(false); return }
 for (const p of pays ?? []) has.add(p.booking_id as string)
 }
 const list = ((data ?? []) as Row[]).filter(b => !has.has(b.id))
 setRows(list); onCount?.(list.length)
 setLoading(false)
 }, [sandbox, onCount])
 // Laden beim Oeffnen und bei Wechsel Sandbox / Production (gleiches Muster wie PendingPayments)
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(() => { void load() }, [load])

 if (!loading && !err && rows.length === 0 && !msg) return null
 return (
 <div style={{ marginBottom: '28px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: '#d4a07a', marginBottom: '4px' }}>Payment status not set{rows.length ? ` (${rows.length})` : ''}</div>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '12px', lineHeight: 1.55 }}>
 Front Office bookings with Cash, Transfer or Revolut where nobody has said yet whether the guest paid. Set it here, or open the booking.
 </div>
 {msg && <div style={{ fontSize: '14px', marginBottom: '10px', color: '#b7c4b0' }}>Saved: {msg}</div>}
 {loading ? <div style={{ fontSize: '14px', color: s.muted }}>Loading…</div>
 : err ? <div style={{ fontSize: '14px', color: '#c9928c' }}>Could not load this list: {err}</div>
 : rows.map(r => (
 <div key={r.id} style={{ background: 'rgba(212,160,122,.04)', border: '1px solid rgba(212,160,122,.3)', borderRadius: 0, padding: '14px 18px', marginBottom: '10px' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>{r.customer_name ?? '—'}</div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px' }}>
 {r.product_name ?? '—'} · dive day {dmy(r.booking_date)} · {METHOD[r.payment_method ?? ''] ?? r.payment_method}
 </div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px' }}>
 created {dmy(r.created_at.slice(0, 10))}{r.created_by_email ? ` by ${who(r.created_by_email)}` : ''} ·{' '}
 <button type="button" onClick={() => onOpenBooking(r.id)} title="Open booking" style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', fontSize: '14px', fontWeight: 500, color: s.accent, textDecoration: 'underline' }}>{r.id.slice(0, 8).toUpperCase()}</button>
 </div>
 </div>
 <div style={{ fontSize: '20px', fontWeight: 500, color: '#d4a07a' }}>{eur(r.amount)}</div>
 </div>
 {open === r.id
 ? <div style={{ marginTop: '12px' }}><PaymentDecision compact bookingIds={[r.id]} onDone={note => { setOpen(null); setMsg(note); void load() }} /></div>
 : <button type="button" onClick={() => { setMsg(null); setOpen(r.id) }} style={{ marginTop: '10px', width: '100%', padding: '10px', borderRadius: 0, border: '1px solid color-mix(in srgb, var(--text) 40%, transparent)', background: 'color-mix(in srgb, var(--text) 8%, transparent)', color: s.accent, fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>Set payment status</button>}
 </div>
 ))}
 </div>
 )
}
