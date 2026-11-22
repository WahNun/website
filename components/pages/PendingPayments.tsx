'use client'

/**
 * Pending payments — Zahlungen, die das Team als „Pending" angelegt hat und die auf dem Konto ankommen müssen
 * (Überweisung, Revolut, MB WAY …). Cláudia prüft den Kontoauszug und bestätigt „Received on account":
 * gleiche Wirkung wie „Mark as received" im Front Office (Zahlung paid, Changelog, Gast-Mail).
 * Bar, Karte/Stripe und „on arrival" erscheinen hier nicht (werden am Tresen bzw. automatisch gebucht).
 */

import React, { useCallback, useEffect, useState } from 'react'
import { supabase, s } from '@/components/pages/_shared'
import { auditFromClient } from '@/lib/auditClient'
import { useStaffNames } from '@/lib/useStaffNames'
import CsvButton from '@/components/finance/CsvButton'
import { pendingPaymentsTable } from '@/components/finance/financeCsvTables'
import { csvFileName } from '@/lib/financeReports'

type Row = {
 id: string; booking_id: string; amount: number; currency: string | null; method: string; due_at: string | null; notes: string | null; created_at: string
 customer_name: string | null; product_name: string | null; booking_date: string | null
}

const EXCLUDED = ['cash', 'on_arrival', 'card', 'stripe', 'card_terminal', 'link']
const LABEL: Record<string, string> = { bank_transfer: ' Transfer', bank: ' Transfer', revolut: ' Revolut', mb_way: ' MB WAY', other: 'Other' }
const eur = (c: number) => `€${(c / 100).toFixed(2)}`

export default function PendingPayments({ sandbox, onCount, onOpenBooking }: { sandbox: boolean | null; onCount?: (n: number) => void; onOpenBooking?: (id: string) => void }) {
 const who = useStaffNames()
 const [rows, setRows] = useState<Row[]>([])
 const [loading, setLoading] = useState(true)
 const [err, setErr] = useState<string | null>(null)
 const [busy, setBusy] = useState<string | null>(null)
 const [msg, setMsg] = useState<string | null>(null)

 const load = useCallback(async () => {
 if (sandbox === null) return
 setLoading(true); setErr(null)
 const { data, error } = await supabase.from('booking_payments')
 .select('id, booking_id, amount, currency, method, due_at, notes, created_at')
 .eq('status', 'pending').not('method', 'in', `(${EXCLUDED.join(',')})`).order('created_at')
 if (error) { setErr(`${error.code ?? ''} ${error.message}`.trim()); setLoading(false); return }
 const ids = [...new Set((data ?? []).map(r => r.booking_id as string))]
 const { data: bks, error: bErr } = ids.length
 ? await supabase.from('bookings').select('id, customer_name, product_name, booking_date, is_test').in('id', ids)
 : { data: [], error: null }
 if (bErr) { setErr(`${bErr.code ?? ''} ${bErr.message}`.trim()); setLoading(false); return }
 const by = new Map((bks ?? []).map(b => [b.id as string, b]))
 const list: Row[] = []
 for (const r of data ?? []) {
 const b = by.get(r.booking_id as string)
 if (!b || (b.is_test === true) !== (sandbox === true)) continue
 list.push({ ...(r as Row), customer_name: (b.customer_name as string) ?? null, product_name: (b.product_name as string) ?? null, booking_date: (b.booking_date as string) ?? null })
 }
 setRows(list); onCount?.(list.length)
 setLoading(false)
 }, [sandbox, onCount])
 useEffect(() => { void load() }, [load])

 async function received(r: Row) {
 setBusy(r.id); setMsg(null)
 try {
 const { error } = await supabase.from('booking_payments').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', r.id).eq('status', 'pending')
 if (error) { setMsg(` Not saved: ${error.code ?? ''} ${error.message}`); setBusy(null); return }
 const label = LABEL[r.method] ?? r.method
 const desc = `Payment received: ${eur(r.amount)} via ${label}`
 const email = (await supabase.auth.getUser()).data.user?.email ?? null
 await supabase.from('booking_changelog').insert({ booking_id: r.booking_id, changed_by_email: email, action: 'payment_received', field: null, old_value: null, new_value: null, description: desc })
 void auditFromClient(supabase, { bookingId: r.booking_id, action: 'payment_received', description: desc })
 let mailNote = ''
 try {
 const token = (await supabase.auth.getSession()).data.session?.access_token
 const res = await fetch('/api/payment-registered', {
 method: 'POST',
 headers: { 'content-type': 'application/json', authorization: `Bearer ${token ?? ''}` },
 body: JSON.stringify({ booking_id: r.booking_id, amount_cents: r.amount, method_label: label }),
 })
 const d = await res.json().catch(() => ({}))
 mailNote = !res.ok || !d.ok ? ` · email not sent (HTTP ${res.status}): ${d.error ?? 'unknown error'}`
 : d.mail === 'booking_confirmation' ? ' · booking confirmation sent' : d.mail === 'payment_received' ? ' · payment received email sent' : ' · no email'
 } catch (e) { mailNote = ` · email not sent: ${e instanceof Error ? e.message : String(e)}` }
 setMsg(` ${eur(r.amount)} marked as received${mailNote}`)
 const next = rows.filter(x => x.id !== r.id)
 setRows(next); onCount?.(next.length)
 } catch (e) {
 setMsg(` ${e instanceof Error ? e.message : 'Network error'}`)
 }
 setBusy(null)
 }

 if (!loading && !err && rows.length === 0 && !msg) return null
 return (
 <div style={{ marginBottom: '28px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)', marginBottom: '4px' }}>Payments to confirm on the account{rows.length ? ` (${rows.length})` : ''}</div>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '12px', lineHeight: 1.55 }}>
 Recorded by the team as <b style={{ color: s.text }}>pending</b> (transfer, Revolut, MB WAY). Check the bank statement, then confirm — the booking counts the money as paid and the guest gets the payment email.
 </div>
 {rows.length > 0 && (
 <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
 <CsvButton fileName={csvFileName('payments-to-confirm', null, Boolean(sandbox))} table={pendingPaymentsTable(rows)} />
 </div>
 )}
 {msg && <div style={{ fontSize: '14px', marginBottom: '10px', color: msg.startsWith('') ? 'var(--text)' : 'var(--text)' }}>{msg}</div>}
 {loading ? <div style={{ fontSize: '14px', color: s.muted }}>Loading…</div>
 : err ? <div style={{ fontSize: '14px', color: 'var(--text)' }}> Could not load pending payments: {err}</div>
 : rows.map(r => (
 <div key={r.id} style={{ background: 'transparent', border: '1px solid var(--line)', borderRadius: 'var(--radius-card)', padding: '14px 18px', marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>{r.customer_name ?? '—'}</div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px' }}>
 {r.product_name ?? '—'} · {onOpenBooking
 ? <button type="button" onClick={() => onOpenBooking(r.booking_id)} title="Open booking" style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', fontSize: '14px', fontWeight: 500, color: s.accent, textDecoration: 'underline' }}>{r.booking_id.slice(0, 8).toUpperCase()}</button>
 : <span style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, monospace' }}>{r.booking_id.slice(0, 8).toUpperCase()}</span>}
 {r.booking_date ? ` · ${new Date(r.booking_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}` : ''}
 </div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px' }}>
 {LABEL[r.method] ?? r.method} · recorded {new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
 {r.due_at ? ` · due ${new Date(r.due_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}` : ''}
 </div>
 </div>
 <div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text)' }}>{eur(r.amount)}</div>
 </div>
 {r.notes && <div style={{ fontSize: '14px', color: s.text, padding: '8px 10px', background: 'rgba(255,255,255,.03)', borderRadius: 'var(--radius-card)', borderLeft: '3px solid var(--line)' }}>{r.notes}</div>}
 <button type="button" disabled={busy === r.id} onClick={() => received(r)}
 style={{ padding: '10px', borderRadius: 'var(--radius-control)', border: 'none', background: 'transparent', color: 'var(--on-accent)', fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: s.font, opacity: busy === r.id ? .6 : 1 }}>
 {busy === r.id ? 'Saving…' : ` Received on account — ${eur(r.amount)}`}
 </button>
 </div>
 ))}
 </div>
 )
}
