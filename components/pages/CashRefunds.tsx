'use client'

/**
 * Cash refunds — Front Office gibt Bargeld-Rückzahlungen selbst frei (Entscheidung Lucas/Cláudia 30.10.).
 * Zeigt offene Refund-Anträge mit method = cash; „Cash handed over" ruft /api/refund-paid (Gast-Mail + Gutschrift wie in Finances).
 * Andere Auszahlungsarten (Stripe, Bank, Revolut, MB WAY) bleiben bei Finances / Admin.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { supabase, s } from '@/components/pages/_shared'
import { useStaffNames } from '@/lib/useStaffNames'

type Row = {
 id: string; booking_id: string; amount: number; description: string; requested_at: string; requested_by_email: string | null; is_test: boolean
 customer_name: string | null; product_name: string | null; phone: string | null
}

const eur = (c: number) => `€${(c / 100).toFixed(2)}`

export default function CashRefunds({ sandbox, onChanged }: { sandbox: boolean | null; onChanged?: () => void }) {
 const who = useStaffNames()
 const [rows, setRows] = useState<Row[]>([])
 const [loading, setLoading] = useState(true)
 const [err, setErr] = useState<string | null>(null)
 const [busy, setBusy] = useState<string | null>(null)
 const [note, setNote] = useState<Record<string, string>>({})
 const [msg, setMsg] = useState<string | null>(null)

 const load = useCallback(async () => {
 if (sandbox === null) return
 setLoading(true); setErr(null)
 const { data, error } = await supabase.from('booking_refunds')
 .select('id, booking_id, amount, description, requested_at, requested_by_email, is_test')
 .eq('status', 'requested').eq('method', 'cash').eq('is_test', sandbox === true).order('requested_at')
 if (error) { setErr(`${error.code ?? ''} ${error.message}`.trim()); setLoading(false); return }
 const ids = [...new Set((data ?? []).map(r => r.booking_id as string))]
 const { data: bks } = ids.length ? await supabase.from('bookings').select('id, customer_name, customer_email, product_name').in('id', ids) : { data: [] }
 const by = new Map((bks ?? []).map(b => [b.id as string, b]))
 setRows((data ?? []).map(r => {
 const b = by.get(r.booking_id as string)
 return { ...(r as Omit<Row, 'customer_name' | 'product_name' | 'phone'>), customer_name: (b?.customer_name as string) ?? null, product_name: (b?.product_name as string) ?? null, phone: null }
 }))
 setLoading(false)
 }, [sandbox])
 useEffect(() => { void load() }, [load])

 async function confirm(r: Row) {
 setBusy(r.id); setMsg(null)
 try {
 const token = (await supabase.auth.getSession()).data.session?.access_token
 const res = await fetch('/api/refund-paid', {
 method: 'POST',
 headers: { 'content-type': 'application/json', authorization: `Bearer ${token ?? ''}` },
 body: JSON.stringify({ refund_id: r.id, notes: (note[r.id] ?? '').trim() || null }),
 })
 const d = await res.json().catch(() => ({}))
 if (!res.ok || !d.ok) setMsg(` Not confirmed (HTTP ${res.status}): ${d.error ?? 'unknown error'}`)
 else {
 setMsg(d.mail === 'refund' ? ` Done — ${eur(d.amount_cents ?? r.amount)} cash refund confirmed, guest emailed` : ` Done — confirmed, but no email sent: ${d.error ?? 'unknown'}`)
 setRows(prev => prev.filter(x => x.id !== r.id))
 onChanged?.()
 }
 } catch (e) {
 setMsg(` ${e instanceof Error ? e.message : 'Network error'}`)
 }
 setBusy(null)
 }

 return (
 <div style={{ padding: '4px 0' }}>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '14px', lineHeight: 1.55 }}>
 Open refund requests paid out in <b style={{ color: s.text }}>cash</b>. Hand the money to the guest first, then press the green button — the guest gets the refund email and the credit note is issued.
 </div>
 {msg && <div style={{ fontSize: '14px', marginBottom: '10px', color: msg.startsWith('') ? '#b7c4b0' : '#c9928c' }}>{msg}</div>}
 {loading ? <div style={{ fontSize: '14px', color: s.muted }}>Loading…</div>
 : err ? <div style={{ fontSize: '14px', color: '#c9928c' }}> Could not load cash refunds: {err}</div>
 : rows.length === 0 ? <div style={{ background: 'rgba(183,196,176,.05)', border: '1px solid rgba(183,196,176,.15)', borderRadius: 0, padding: '18px 22px', fontSize: '14px', color: '#b7c4b0', textAlign: 'center' }}>No cash refunds waiting</div>
 : rows.map(r => (
 <div key={r.id} style={{ background: 'rgba(255,100,100,.04)', border: '1px solid rgba(255,100,100,.18)', borderRadius: 0, padding: '14px 18px', marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 700, color: s.text }}>{r.customer_name ?? '—'}{r.is_test ? <span style={{ marginLeft: '8px', fontSize: '14px', color: '#FFD080', border: '1px solid rgba(201,180,138,.4)', borderRadius: 0, padding: '1px 5px' }}>TEST</span> : null}</div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px' }}>{r.product_name ?? '—'} · <span style={{ fontFamily: 'monospace' }}>{r.booking_id.slice(0, 8).toUpperCase()}</span> · requested {new Date(r.requested_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}{r.requested_by_email ? ` by ${who(r.requested_by_email)}` : ''}</div>
 </div>
 <div style={{ fontSize: '20px', fontWeight: 800, color: '#c9928c' }}>{eur(r.amount)}</div>
 </div>
 <div style={{ fontSize: '14px', color: s.text, padding: '8px 10px', background: 'rgba(255,255,255,.03)', borderRadius: 0, borderLeft: '3px solid #d4a07a' }}>{r.description}</div>
 <input type="text" placeholder="Note (optional) — e.g. handed over to guest at the centre" value={note[r.id] ?? ''} onChange={e => setNote(prev => ({ ...prev, [r.id]: e.target.value }))}
 style={{ width: '100%', boxSizing: 'border-box', background: '#090909', border: '1px solid rgba(255,255,255,.12)', borderRadius: 0, color: s.text, fontSize: '14px', padding: '7px 10px', fontFamily: s.font, outline: 'none' }} />
 <button type="button" disabled={busy === r.id} onClick={() => confirm(r)}
 style={{ padding: '10px', borderRadius: 0, border: 'none', background: 'rgba(183,196,176,.85)', color: '#090909', fontWeight: 700, fontSize: '14px', cursor: 'pointer', fontFamily: s.font, opacity: busy === r.id ? .6 : 1 }}>
 {busy === r.id ? 'Confirming…' : ` Cash handed over — ${eur(r.amount)}`}
 </button>
 </div>
 ))}
 </div>
 )
}
