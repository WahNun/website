'use client'
/**
 * /request/<token> — Gastseite zu einer Buchungsanfrage (Lucas 28.10.2026).
 * Freigegeben: „Confirm & pay" erzeugt JETZT die Stripe-Session (Kapazität wird geprüft) und leitet zur Zahlung —
 * kein Link in der Mail, der ablaufen könnte. „This doesn't work for me" Textfeld Anfrage geht zurück ans Team.
 * Zeigt nur die Zusammenfassung, keine persönlichen Daten.
 */
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { s } from '@/components/pages/_shared'

type Summary = {
 reference: string
 product_name: string
 guests: number
 total_cents: number
 payment_mode: 'full' | 'deposit' | null
 request_state: string | null
 status: string
 approved_until: string | null
 is_test: boolean
 sessions: { date: string; session: string }[]
 dates_changed: boolean
 requested_sessions: { date: string; session: string }[]
 shortened_from: { productName: string; amountCents: number } | null
}

function fmtDay(d: string) {
 return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}
const sessLabel = (x: { date: string; session: string }) => `${fmtDay(x.date)}${x.session === 'tbd' ? '' : ` ${x.session.toUpperCase()}`}`

export default function RequestPage() {
 const params = useParams<{ token: string }>()
 const qp = useSearchParams()
 const token = String(params?.token ?? '')
 const [summary, setSummary] = useState<Summary | null>(null)
 const [loadError, setLoadError] = useState<string | null>(null)
 const [working, setWorking] = useState<'pay' | 'reply' | null>(null)
 const [actionError, setActionError] = useState<string | null>(null)
 const [newUrl, setNewUrl] = useState<string | null>(null)
 const [replyOpen, setReplyOpen] = useState(qp.get('reply') === '1')
 const [replyText, setReplyText] = useState('')
 const [replied, setReplied] = useState(false)

 useEffect(() => {
 if (!token) return
 fetch(`/api/booking-request/new-link?token=${encodeURIComponent(token)}`)
 .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${d.error ?? 'Could not load this request'} (HTTP ${r.status})`); return d })
 .then(d => setSummary(d.booking as Summary))
 .catch(e => setLoadError(e instanceof Error ? e.message : String(e)))
 }, [token])

 async function confirmAndPay() {
 setWorking('pay'); setActionError(null)
 try {
 const r = await fetch('/api/booking-request/new-link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })
 const d = await r.json().catch(() => ({}))
 if (!r.ok || !d.url) throw new Error(`${d.error ?? 'Could not open the payment page'} (HTTP ${r.status})`)
 setNewUrl(String(d.url))
 window.location.href = String(d.url)
 } catch (e) {
 setActionError(e instanceof Error ? e.message : String(e))
 } finally {
 setWorking(null)
 }
 }
 async function sendReply() {
 setWorking('reply'); setActionError(null)
 try {
 const r = await fetch('/api/booking-request/reopen', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, message: replyText.trim() }) })
 const d = await r.json().catch(() => ({}))
 if (!r.ok) throw new Error(`${d.error ?? 'Could not send your reply'} (HTTP ${r.status})`)
 setReplied(true)
 setSummary(sm => sm ? { ...sm, request_state: 'requested' } : sm)
 } catch (e) {
 setActionError(e instanceof Error ? e.message : String(e))
 } finally {
 setWorking(null)
 }
 }

 const paid = summary && (summary.status === 'confirmed' || summary.status === 'completed')
 const canConfirm = summary && summary.status === 'pending' && (summary.request_state === 'approved' || summary.request_state === 'expired')
 const amountDue = summary ? (summary.payment_mode === 'deposit' ? Math.ceil(summary.total_cents / 2) : summary.total_cents) : 0
 const untilLine = summary?.approved_until ? new Date(summary.approved_until).toLocaleString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }) : null
 const btnPrimary = (disabled: boolean): React.CSSProperties => ({ width: '100%', padding: '15px', borderRadius: 0, border: 'none', fontSize: '16px', fontWeight: 500, fontFamily: s.font, cursor: disabled ? 'default' : 'pointer', background: disabled ? 'rgba(255,255,255,.08)' : s.accent, color: disabled ? s.muted : '#090909' })
 const box = (color: string, border: string): React.CSSProperties => ({ background: 'transparent', border: `1px solid ${border}`, borderRadius: 0, padding: '12px 14px', fontSize: '14px', color, lineHeight: 1.6 })

 return (
 <div style={{ background: s.bgDark, minHeight: '100vh', fontFamily: s.font }}>
 <div style={{ maxWidth: '560px', margin: '0 auto', padding: '48px 20px 80px' }}>
 <h1 style={{ fontSize: 'clamp(26px,4vw,36px)', fontWeight: 500, color: s.text, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
 Your booking request<span style={{ color: s.accent }}>.</span>
 </h1>
 <p style={{ color: s.sub, fontSize: '14.5px', margin: '0 0 28px', lineHeight: 1.6 }}>Nothing is charged until you confirm. If the proposed day does not work, tell us — we will look for another one.</p>

 <div style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.052) 42%, rgba(255,255,255,.03) 100%)', border: '1px solid rgba(243,239,230,.2)', borderRadius: 0, padding: '26px' }}>
 {loadError ? (
 <div style={box('#c9928c', 'rgba(201,146,140,.4)')}>{loadError}<br /><a href="/contact" style={{ color: '#ffb59f', fontWeight: 500 }}>Contact us</a> if you think this is a mistake.</div>
 ) : !summary ? (
 <div style={{ color: s.muted, fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>Loading…</div>
 ) : (
 <>
 {summary.is_test && <div style={{ marginBottom: '14px', fontSize: '14px', fontWeight: 500, color: '#c9b48a' }}>TEST booking</div>}
 {qp.get('cancelled') === '1' && !paid && !replied && (
 <div style={{ ...box('#c9b48a', 'rgba(201,180,138,.35)'), marginBottom: '14px', fontSize: '14px' }}>Payment was not completed. You can confirm again below, or tell us if the day does not work.</div>
 )}

 {(summary.shortened_from || summary.dates_changed) && !paid && summary.status === 'pending' && (
 <div style={{ ...box('#c9b48a', 'rgba(201,180,138,.35)'), marginBottom: '16px', fontSize: '14px' }}>
 {summary.shortened_from
 ? <><strong>We adjusted your booking.</strong> Not enough divers came together for all the days you asked for ({summary.shortened_from.productName}{summary.requested_sessions.length ? `, ${summary.requested_sessions.map(sessLabel).join(' · ')}` : ''}, €{(summary.shortened_from.amountCents / 100).toFixed(2)}). We can run <strong>{summary.product_name}</strong> on {summary.sessions.map(sessLabel).join(' · ')} for €{(summary.total_cents / 100).toFixed(2)}.</>
 : <><strong>We adjusted your dates.</strong> You asked for {summary.requested_sessions.map(sessLabel).join(' · ')} — the day we can run is listed below.</>}
 </div>
 )}

 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '22px' }}>
 {([
 ['Reference', summary.reference],
 ['Product', summary.product_name],
 ['Dive day' + (summary.sessions.length === 1 ? '' : 's'), summary.sessions.length ? summary.sessions.map(sessLabel).join(' · ') : '—'],
 ['Guests', String(summary.guests)],
 ['Total', `€${(summary.total_cents / 100).toFixed(2)}`],
 ...(summary.payment_mode === 'deposit' ? [['Due now', `€${(amountDue / 100).toFixed(2)} (50 % deposit)`]] : []),
 ] as [string, string][]).map(([k, v]) => (
 <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '14px' }}>
 <span style={{ color: s.muted, flexShrink: 0 }}>{k}</span>
 <span style={{ color: s.text, textAlign: 'right' }}>{v}</span>
 </div>
 ))}
 </div>

 {paid ? (
 <div style={box('#b7c4b0', 'rgba(183,196,176,.35)')}>This booking is paid and confirmed. Your check-in link is in your confirmation email.</div>
 ) : summary.status === 'cancelled' ? (
 <div style={box('#c9928c', 'rgba(201,146,140,.4)')}>This request was closed. <Link href="/dive-os/book" style={{ color: '#ffb59f', fontWeight: 500 }}>Book other dates</Link> or <a href="/contact" style={{ color: '#ffb59f', fontWeight: 500 }}>contact us</a>.</div>
 ) : replied ? (
 <div style={box('#b7c4b0', 'rgba(183,196,176,.35)')}>Got it — the proposed day is off the table and nothing has been charged. We will come back to you as soon as another day comes together. You also get this by email.</div>
 ) : summary.request_state === 'requested' ? (
 <div style={box('#c9b48a', 'rgba(201,180,138,.3)')}>Your request is with the team. We collect requests for your dates and email you as soon as a dive day comes together.</div>
 ) : canConfirm ? (
 <>
 {!replyOpen && (
 <>
 <button type="button" onClick={confirmAndPay} disabled={working !== null} style={btnPrimary(working !== null)}>
 {working === 'pay' ? 'Opening the payment page…' : `Confirm & pay €${(amountDue / 100).toFixed(2)}`}
 </button>
 {newUrl && <p style={{ fontSize: '14px', color: s.muted, marginTop: '10px', textAlign: 'center' }}>Not redirected? <a href={newUrl} style={{ color: s.accent }}>Open the payment page</a>.</p>}
 <button type="button" onClick={() => { setReplyOpen(true); setActionError(null) }} disabled={working !== null} style={{ width: '100%', marginTop: '10px', padding: '13px', borderRadius: 0, border: '1px solid rgba(255,255,255,.18)', background: 'transparent', color: s.text, fontSize: '14px', fontWeight: 500, fontFamily: s.font, cursor: 'pointer' }}>
 This day doesn&apos;t work for me
 </button>
 </>
 )}
 {replyOpen && (
 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
 <div style={{ fontSize: '14px', color: s.text, fontWeight: 500 }}>What would work for you?</div>
 <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={4} placeholder="e.g. We arrive on the 16th — anything from the 17th works. Or: we'd rather wait for two days of diving."
 style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: 0, border: '1px solid rgba(255,255,255,.18)', background: 'rgba(0,0,0,.25)', color: s.text, fontSize: '14px', fontFamily: s.font, resize: 'vertical' }} />
 <button type="button" onClick={sendReply} disabled={working !== null} style={btnPrimary(working !== null)}>{working === 'reply' ? 'Sending…' : 'Send — we’ll look for another day'}</button>
 <button type="button" onClick={() => setReplyOpen(false)} disabled={working !== null} style={{ background: 'none', border: 'none', color: s.muted, fontSize: '14px', cursor: 'pointer', fontFamily: s.font }}>Back</button>
 <p style={{ fontSize: '14px', color: s.muted, margin: 0, lineHeight: 1.5 }}>Sending this takes the proposed day off the table — nothing is charged, and we start again from your request.</p>
 </div>
 )}
 {actionError && <div style={{ ...box('#c9928c', 'rgba(201,146,140,.4)'), marginTop: '12px', fontSize: '14px' }}>{actionError}</div>}
 {!replyOpen && (
 <p style={{ textAlign: 'center', fontSize: '14px', color: s.muted, marginTop: '14px', marginBottom: 0, lineHeight: 1.6 }}>
 Secure payment via Stripe · The payment page opens when you confirm{untilLine ? ` · Please decide by ${untilLine}` : ''}
 </p>
 )}
 </>
 ) : (
 <div style={{ color: s.muted, fontSize: '14px' }}>Nothing to do here right now. <a href="/contact" style={{ color: s.accent }}>Contact us</a> if you have a question.</div>
 )}
 </>
 )}
 </div>
 </div>
 </div>
 )
}
