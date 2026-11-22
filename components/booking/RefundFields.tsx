'use client'

import React from 'react'
import { s } from '@/components/pages/_shared'
import { CANCEL_REASONS, REFUND_REASONS, composeReason, payoutNeeded, reasonComplete } from '@/lib/refundReasons'

/**
 * Gemeinsame Pflichtfelder für Cancel- und Refund-Formulare im Front Office:
 * - ReasonField: Dropdown mit häufigen Gründen + Pflicht-Notiz
 * - PayoutFields: Zielkonto bei Bank / MB Way / Revolut / Other
 * Die Server-Routen prüfen dasselbe (lib/refundReasons.ts) — das UI soll nur früh und freundlich warnen.
 */

const lbl: React.CSSProperties = { fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, display: 'block', marginBottom: '4px' }
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'var(--bg)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 0, color: s.text, fontSize: '14px', padding: '7px 10px', fontFamily: s.font, outline: 'none', colorScheme: 'dark' }

export function ReasonField({ kind, choice, detail, onChoice, onDetail, placeholder }: {
 kind: 'cancel' | 'refund'
 choice: string
 detail: string
 onChoice: (v: string) => void
 onDetail: (v: string) => void
 placeholder?: string
}) {
 const list = kind === 'cancel' ? CANCEL_REASONS : REFUND_REASONS
 const isOther = choice === 'Other'
 const missing = !reasonComplete(choice, detail)
 return (
 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
 <label style={lbl}>Reason (required — Claudia sees it in Finances)</label>
 <select value={choice} onChange={e => onChoice(e.target.value)} style={{ ...inp, borderColor: !choice ? 'rgba(212,160,122,.55)' : 'rgba(255,255,255,.14)' }}>
 <option value="">Select a reason…</option>
 {list.map(r => <option key={r} value={r}>{r}</option>)}
 </select>
 <input type="text" value={detail} onChange={e => onDetail(e.target.value)}
 placeholder={isOther ? 'Describe the reason (required for "Other")' : (placeholder ?? 'Note (optional) — e.g. "Day 2 cancelled, wind 30 kn"')}
 style={{ ...inp, borderColor: isOther && detail.trim().length < 3 ? 'rgba(212,160,122,.55)' : 'rgba(255,255,255,.14)' }} />
 {missing && <div style={{ fontSize: '14px', color: '#d4a07a' }}>{!choice ? 'Pick a reason.' : 'Add a short note for "Other".'}</div>}
 </div>
 )
}

export type PayoutValue = { iban: string; bic: string; holder: string; phone: string; other: string }
export const emptyPayout: PayoutValue = { iban: '', bic: '', holder: '', phone: '', other: '' }

/** Textform, die in booking_refunds.payout_details landet. */
export function payoutString(method: string, v: PayoutValue): string {
 if (method === 'bank') return [`IBAN: ${v.iban.replace(/\s+/g, '').toUpperCase()}`, v.bic.trim() ? `BIC: ${v.bic.replace(/\s+/g, '').toUpperCase()}` : '', `Holder: ${v.holder.trim()}`].filter(Boolean).join(' · ')
 if (method === 'mb_way') return `Phone: ${v.phone.trim()}`
 if (method === 'revolut') return `Phone / @tag: ${v.phone.trim()}`
 if (method === 'other') return `Details: ${v.other.trim()}`
 return ''
}

export function PayoutFields({ method, value, onChange }: { method: string; value: PayoutValue; onChange: (v: PayoutValue) => void }) {
 if (!payoutNeeded(method)) return null
 const set = (patch: Partial<PayoutValue>) => onChange({ ...value, ...patch })
 return (
 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '9px 10px', borderRadius: 0, background: 'rgba(201,180,138,.06)', border: '1px solid rgba(201,180,138,.3)' }}>
 <label style={{ ...lbl, color: '#c9b48a', marginBottom: 0 }}>Where should the money go? (required)</label>
 {method === 'bank' && (<>
 <input type="text" value={value.iban} onChange={e => set({ iban: e.target.value })} placeholder="IBAN, e.g. PT50 0000 0000 0000 0000 0000 0" style={inp} />
 <input type="text" value={value.bic} onChange={e => set({ bic: e.target.value })} placeholder="BIC / SWIFT (optional)" style={inp} />
 <input type="text" value={value.holder} onChange={e => set({ holder: e.target.value })} placeholder="Account holder name" style={inp} />
 </>)}
 {(method === 'mb_way' || method === 'revolut') && (
 <input type="text" value={value.phone} onChange={e => set({ phone: e.target.value })}
 placeholder={method === 'mb_way' ? 'Guest MB WAY phone number, e.g. +351 912 345 678' : 'Guest Revolut phone number or @username'} style={inp} />
 )}
 <div style={{ fontSize: '14px', color: s.muted }}>Only the person who authorizes the refund sees this. After payout it is kept masked.</div>
 </div>
 )
}

export { composeReason }

/** Zerlegt payout_details („IBAN: … · BIC: … · Holder: …") in einzelne kopierbare Felder. */
export function parsePayout(details: string): { label: string; value: string }[] {
 return details.split(' · ').map(part => {
 const i = part.indexOf(':')
 return i > 0 && i < 20 ? { label: part.slice(0, i).trim(), value: part.slice(i + 1).trim() } : { label: 'Details', value: part.trim() }
 }).filter(x => x.value)
}

/** Copy-Button mit Bestätigung im Button selbst („ Copied"). */
export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
 const [state, setState] = React.useState<'idle' | 'ok' | 'fail'>('idle')
 async function copy() {
 let ok = false
 try { await navigator.clipboard.writeText(value); ok = true } catch {
 try { // Fallback für Browser ohne Clipboard-API (z. B. unsichere Kontexte)
 const ta = document.createElement('textarea'); ta.value = value; ta.style.position = 'fixed'; ta.style.opacity = '0'
 document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); document.body.removeChild(ta)
 } catch { ok = false }
 }
 setState(ok ? 'ok' : 'fail')
 setTimeout(() => setState('idle'), 1600)
 }
 return (
 <button type="button" onClick={copy}
 style={{ padding: '3px 10px', borderRadius: 0, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, minWidth: '74px',
 border: `1px solid ${state === 'ok' ? 'rgba(183,196,176,.6)' : state === 'fail' ? 'rgba(201,146,140,.6)' : 'rgba(201,180,138,.5)'}`,
 background: state === 'ok' ? 'rgba(183,196,176,.15)' : 'transparent',
 color: state === 'ok' ? '#b7c4b0' : state === 'fail' ? '#c9928c' : '#c9b48a' }}>
 {state === 'ok' ? ' Copied' : state === 'fail' ? 'Copy failed' : label}
 </button>
 )
}
