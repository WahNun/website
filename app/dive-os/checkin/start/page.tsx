'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

/**
 * Landeseite direkt nach der Stripe-Zahlung.
 *
 * Der Kunde ist schneller zurück als der Webhook. Statt ihm einen Fehler zu
 * zeigen, pollen wir kurz und leiten dann in den Check-in weiter.
 */
function StartInner() {
 const params = useSearchParams()
 const router = useRouter()
 const sessionId = params.get('session_id')
 // Fehlende Session-ID ist keine Zustandsaenderung, sondern schon beim Rendern klar
 const [state, setState] = useState<'waiting' | 'slow' | 'error' | 'choose'>(sessionId ? 'waiting' : 'error')
 // Split-Zahlung: mehrere Gäste, je eigene Buchung + eigener Check-in-Link
 // Toast „Link copied“ (verschwindet nach 2,5 s); Fehler werden sichtbar gemeldet
 const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null)
 async function copyLink(token: string, label: string) {
 const url = `${window.location.origin}/checkin?token=${token}`
 try {
 await navigator.clipboard.writeText(url)
 setToast({ text: `${label} check-in link copied to clipboard` })
 } catch (e) {
 setToast({ text: `Could not copy — ${e instanceof Error ? e.message : 'clipboard not available'}. Long-press the button to copy the link instead.`, error: true })
 }
 setTimeout(() => setToast(null), 2500)
 }
 const [guests, setGuests] = useState<{ label: string; token: string; product_name: string | null; booking_date: string | null; session: string | null; extras: string[]; done: boolean }[]>([])

 useEffect(() => {
 if (!sessionId) return

 let cancelled = false
 let attempt = 0
 const MAX_ATTEMPTS = 20 // ~30 s

 async function poll() {
 if (cancelled) return
 attempt++
 try {
 const res = await fetch(`/api/checkin/by-session?session_id=${encodeURIComponent(sessionId!)}`)
 const data = await res.json()
 if (cancelled) return
 if (data.ready && data.token) {
 if (Array.isArray(data.guests) && data.guests.length > 1) { setGuests(data.guests); setState('choose'); return }
 router.replace(`/dive-os/checkin?token=${data.token}`)
 return
 }
 if (res.status === 400 || res.status === 404) { setState('error'); return }
 } catch { /* Netzwerkhänger — einfach weiter versuchen */ }

 if (attempt >= MAX_ATTEMPTS) { setState('slow'); return }
 if (attempt === 6) setState('slow')
 setTimeout(poll, 1500)
 }

 poll()
 return () => { cancelled = true }
 }, [sessionId, router])

 return (
 <div style={{
 minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)',
 display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
 gap: '18px', padding: '40px', textAlign: 'center',
 fontFamily: 'var(--font-geist-sans), sans-serif',
 }}>
 {state === 'choose' ? (
 <>
 <div style={{ fontSize: '32px' }}></div>
 <h1 style={{ fontSize: '20px', fontWeight: 500, margin: 0 }}>Payment received</h1>
 <p style={{ fontSize: '14px', color: 'rgba(255,255,255,.55)', margin: 0, maxWidth: '380px', lineHeight: 1.6 }}>
 Your booking has {guests.length} guests. Each guest checks in with their own link — we also sent all links to your email.
 </p>
 <div style={{ width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left' }}>
 {guests.map(g => (
 <div key={g.token} style={{ background: 'color-mix(in srgb, var(--text) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--text) 20%, transparent)', borderRadius: 'var(--radius-card)', padding: '14px 16px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>{g.label}</div>
 <div style={{ fontSize: '14px', color: 'var(--text)', marginTop: '2px' }}>{g.product_name ?? 'Booking'}</div>
 <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.55)', marginTop: '2px' }}>
 {g.booking_date ?? ''}{g.session ? ` · ${g.session.toUpperCase()}` : ''}
 </div>
 {g.extras.length > 0 && <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.5)', marginTop: '2px' }}>+ {g.extras.join(', ')}</div>}
 {g.done
 ? <div style={{ marginTop: '10px', fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}> Checked in</div>
 : (
 <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
 <a href={`/dive-os/checkin?token=${g.token}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', padding: '9px 16px', borderRadius: 'var(--radius-control)', background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 500, fontSize: '14px', textDecoration: 'none' }}>Check in {g.label.replace(/ — .*/, '')} </a>
 <button type="button" onClick={() => void copyLink(g.token, g.label.replace(/ — .*/, ''))} title="Copy this guest's check-in link"
 style={{ padding: '9px 14px', borderRadius: 'var(--radius-control)', border: '1px solid color-mix(in srgb, var(--text) 35%, transparent)', background: 'transparent', color: 'var(--text)', fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
 Copy check-in link
 </button>
 </div>
 )}
 </div>
 ))}
 </div>
 </>
 ) : state !== 'error' ? (
 <>
 <div style={{
 width: '38px', height: '38px', borderRadius: '50%',
 border: '3px solid color-mix(in srgb, var(--text) 20%, transparent)', borderTopColor: 'var(--accent)',
 animation: 'spin 0.9s linear infinite',
 }} />
 <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
 <h1 style={{ fontSize: '20px', fontWeight: 500, margin: 0 }}>Payment received</h1>
 <p style={{ fontSize: '14px', color: 'rgba(255,255,255,.55)', margin: 0, maxWidth: '340px', lineHeight: 1.6 }}>
 {state === 'waiting'
 ? 'Preparing your online check-in…'
 : 'Almost there — this is taking a moment longer than usual.'}
 </p>
 {state === 'slow' && (
 <p style={{ fontSize: '14px', color: 'rgba(255,255,255,.35)', margin: 0, maxWidth: '340px', lineHeight: 1.6 }}>
 Your booking is confirmed either way. If this page does not move on,
 check your email — the check-in link is in your confirmation.
 </p>
 )}
 </>
 ) : (
 <>
 <div style={{ fontSize: '32px' }}></div>
 <h1 style={{ fontSize: '20px', fontWeight: 500, margin: 0 }}>We could not find that checkout</h1>
 <p style={{ fontSize: '14px', color: 'rgba(255,255,255,.55)', margin: 0, maxWidth: '340px', lineHeight: 1.6 }}>
 If you completed a payment, your booking is safe. Please use the
 check-in link from your confirmation email, or contact us.
 </p>
 <Link href="/dive-os/book" style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 500, textDecoration: 'none' }}>Back to booking</Link>
 </>
 )}
 {toast && (
 <div role="status" style={{ position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)', padding: '11px 18px', borderRadius: 'var(--radius-card)', background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--text)', fontSize: '14px', fontWeight: 500, maxWidth: '90vw', boxShadow: 'none', zIndex: 50 }}>
 {toast.error ? ' ' : ' '}{toast.text}
 </div>
 )}
 </div>
 )
}

export default function Page() {
 return (
 <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--bg)' }} />}>
 <StartInner />
 </Suspense>
 )
}
