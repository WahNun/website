import type { SupabaseClient } from '@supabase/supabase-js'
import { sendMail, replyToAddress } from '@/lib/email'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>

export const UNPAID_ALERT_DAYS = 3
const ADMIN_INBOX = process.env.ADMIN_ALERT_EMAIL?.trim() || 'admin.azoresdiving@gmail.com'

/**
 * Audit K2: unbezahlte Buchungen (status pending, keine bezahlte Zahlungszeile) laufen nie ab und
 * halten Plätze. Wir stornieren NICHT automatisch — wir machen sie sichtbar: einmal täglich eine
 * Liste ans Admin-Postfach + Changelog-Eintrag an der Buchung (nur einmal pro Buchung, Marker-Action).
 */
export async function flagUnpaidBookings(db: Db, isTest: boolean): Promise<{ flagged: number; listed: number; error?: string }> {
  const cutoff = new Date(Date.now() - UNPAID_ALERT_DAYS * 86400000).toISOString()
  const { data: rows, error } = await db
    .from('bookings')
    .select('id, created_at, customer_name, customer_email, product_name, booking_date, amount, payment_method, group_size')
    .eq('status', 'pending').eq('is_test', isTest).lte('created_at', cutoff)
    .gte('booking_date', new Date().toISOString().slice(0, 10)) // nur zukünftige Tauchtage — die blockieren Plätze
    .order('booking_date')
  if (error) return { flagged: 0, listed: 0, error: error.message }
  if (!rows?.length) return { flagged: 0, listed: 0 }

  // Zahlungen prüfen (eine teilbezahlte, aber unter 50 % liegende Buchung ist ebenfalls „offen")
  const ids = rows.map((r: { id: string }) => r.id)
  const { data: pays } = await db.from('booking_payments').select('booking_id, amount').in('booking_id', ids).eq('status', 'paid')
  const paidBy = new Map<string, number>()
  for (const p of pays ?? []) paidBy.set(p.booking_id, (paidBy.get(p.booking_id) ?? 0) + (p.amount ?? 0))

  // Nur einmal pro Buchung flaggen
  const { data: flaggedRows } = await db.from('booking_changelog').select('booking_id').in('booking_id', ids).eq('action', 'unpaid_flagged')
  const already = new Set((flaggedRows ?? []).map((r: { booking_id: string }) => r.booking_id))

  let flagged = 0
  const lines: string[] = []
  for (const b of rows) {
    const paid = paidBy.get(b.id) ?? 0
    const ageDays = Math.floor((Date.now() - Date.parse(b.created_at)) / 86400000)
    lines.push(`${b.id.slice(0, 8).toUpperCase()} · ${b.customer_name ?? '—'} <${b.customer_email ?? '—'}> · ${b.product_name ?? '—'} · dive ${b.booking_date} · ${b.group_size ?? 1} guest(s) · ${(b.amount ?? 0) / 100} € booked, ${paid / 100} € paid · ${b.payment_method ?? '?'} · created ${ageDays} days ago`)
    if (!already.has(b.id)) {
      await db.from('booking_changelog').insert({
        booking_id: b.id, action: 'unpaid_flagged',
        description: `⏳ Still unpaid ${ageDays} days after creation (${paid / 100} € of ${(b.amount ?? 0) / 100} €) — no seat is held until 50 % is paid. Chase payment or cancel the booking.`,
      })
      flagged++
    }
  }

  const subject = `${isTest ? '[TEST] ' : ''}${rows.length} unpaid booking(s) older than ${UNPAID_ALERT_DAYS} days still need payment`
  const text = [
    `These bookings are still "pending" (less than 50 % paid). They do not hold seats — the guest has no reserved place until the payment arrives.`,
    `Chase the payment or cancel them in Front Office → Bookings.`,
    ``,
    ...lines,
    ``,
    `This list is sent daily while such bookings exist.`,
  ].join('\n')
  const html = `<pre style="font:13px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;white-space:pre-wrap;color:#111;">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`
  const r = await sendMail({ to: ADMIN_INBOX, subject, text, html, kind: 'unpaid_alert', replyTo: replyToAddress() })
  return { flagged, listed: rows.length, ...(r.ok ? {} : { error: r.error }) }
}

/**
 * Läuft für echte UND Test-Buchungen (zwei getrennte Mails, Test mit "[TEST]" im Betreff).
 * Der Cron entscheidet sonst per Stripe-Key über is_test; mit Live-Key blieben Sandbox-Buchungen
 * (Workshop, Go-live-Tests) ungeprüft.
 */
export async function flagUnpaidBookingsAll(db: Db): Promise<{ flagged: number; listed: number; error?: string }> {
  let flagged = 0, listed = 0
  const errors: string[] = []
  for (const isTest of [false, true]) {
    try {
      const r = await flagUnpaidBookings(db, isTest)
      flagged += r.flagged; listed += r.listed
      if (r.error) errors.push(`${isTest ? 'test' : 'live'}: ${r.error}`)
    } catch (e) {
      errors.push(`${isTest ? 'test' : 'live'}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { flagged, listed, ...(errors.length ? { error: errors.join(' | ') } : {}) }
}
