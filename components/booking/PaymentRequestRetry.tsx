'use client'
import { useState } from 'react'
import { supabase, s } from '@/components/pages/_shared'
import { auditFromClient } from '@/lib/auditClient'

// Zahlungsaufforderung (Transfer / Revolut) an den Gast schicken und das Ergebnis an der Buchung festhalten.
// Jeder Versuch schreibt in den Buchungsverlauf: "payment_request_sent" oder "payment_request_failed" (mit Fehlertext).
// Der letzte Eintrag entscheidet, ob die Buchung unter Finances → Action needed → "Payment request not sent" steht.
// Dort kann eine Meldung auch verworfen werden ("payment_request_dismissed"), z. B. wenn der Versand dauerhaft nicht geht.

export type RequestResult = { ok: boolean; text: string }

// toEmail: abweichende Empfaenger-Adresse (sonst die E-Mail der Buchung)
export async function sendPaymentRequest(bookingId: string, method: string | null | undefined, isDeposit = false, toEmail?: string): Promise<RequestResult> {
  const payment_method = method === 'revolut' ? 'revolut' : 'bank'
  let ok = false, text = '', reason = ''
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token ?? ''
    const res = await fetch('/api/send-payment-request', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ booking_id: bookingId, payment_method, is_deposit: isDeposit, ...(toEmail ? { to_email: toEmail } : {}) }),
    })
    const d = await res.json().catch(() => ({}))
    ok = res.ok && Boolean(d.ok)
    reason = ok ? '' : `HTTP ${res.status}: ${d.error ?? 'unknown error'}${d.ref ? `, ref ${d.ref}` : ''}`
    text = ok ? `payment request sent to ${d.to ?? 'the guest'}` : `payment request not sent (${reason})`
  } catch (e) {
    reason = e instanceof Error ? e.message : String(e)
    text = `payment request not sent (${reason})`
  }
  try {
    const email = (await supabase.auth.getUser()).data.user?.email ?? null
    const action = ok ? 'payment_request_sent' : 'payment_request_failed'
    const description = ok ? `Payment request sent (${payment_method === 'revolut' ? 'Revolut' : 'bank transfer'}) — ${text.replace('payment request sent ', '')}` : `Payment request NOT sent, the guest has no payment details yet. Reason: ${reason}`
    await supabase.from('booking_changelog').insert({ booking_id: bookingId, changed_by_email: email, action, field: null, old_value: null, new_value: null, description })
    void auditFromClient(supabase, { bookingId, action, description })
  } catch { /* Der Verlaufseintrag darf den Ablauf nicht stoppen; das Ergebnis steht in `text` */ }
  return { ok, text }
}

/** Rote Meldung mit "Send again" fuer Buchungen, deren Zahlungsaufforderung nicht rausging. */
export default function PaymentRequestRetry({ items, isDeposit, onAllSent }: { items: Array<{ id: string; name: string; method: string | null; error: string }>; isDeposit?: boolean; onAllSent?: () => void }) {
  const [state, setState] = useState<Record<string, { busy?: boolean; ok?: boolean; text?: string }>>({})
  if (items.length === 0) return null
  const again = async (it: (typeof items)[number]) => {
    setState(m => ({ ...m, [it.id]: { busy: true } }))
    const r = await sendPaymentRequest(it.id, it.method, isDeposit)
    setState(m => { const n = { ...m, [it.id]: { ok: r.ok, text: r.text } }; if (items.every(x => n[x.id]?.ok)) onAllSent?.(); return n })
  }
  return (
    <div style={{ background: 'rgba(255,96,64,.08)', border: '1px solid rgba(255,96,64,.45)', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', textAlign: 'left' }}>
      <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#ff6040', marginBottom: '4px' }}>The payment request was not sent</div>
      <div style={{ fontSize: '12.5px', color: s.muted, marginBottom: '10px', lineHeight: 1.5 }}>The guest has no payment details yet. The payment status itself is saved. Send it again here; if it keeps failing, it stays listed under Finances → Action needed.</div>
      {items.map(it => {
        const st = state[it.id] ?? {}
        return (
          <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid rgba(255,255,255,.08)' }}>
            <div style={{ fontSize: '12.5px', color: s.text, minWidth: 0 }}>
              <b>{it.name}</b>
              <div style={{ color: st.ok ? '#4fe3c8' : '#ff6040', marginTop: '2px' }}>{st.text ?? it.error}</div>
            </div>
            {!st.ok && <button type="button" disabled={st.busy} onClick={() => again(it)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid rgba(243,239,230,.4)', background: 'rgba(243,239,230,.08)', color: s.accent, fontWeight: 700, fontSize: '12.5px', cursor: st.busy ? 'wait' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>{st.busy ? 'Sending…' : 'Send again'}</button>}
          </div>
        )
      })}
    </div>
  )
}
