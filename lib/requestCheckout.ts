/**
 * Request-Booking (Lucas 28.10.2026) — Freigabe mit Bestätigung durch den Gast.
 *
 *   approveRequest          Staff: request_state → approved, Mail „Your dive day is set" mit Confirm & pay / doesn't work.
 *                           KEIN Stripe, keine Platzhalter-Zahlung — der Link entsteht erst, wenn der Gast bestätigt.
 *   createRequestPaymentLink Gast klickt Confirm (oder Staff): Kapazität prüfen, Stripe-Session (24 h, fo_booking_id),
 *                           pending booking_payments je Buchung, stripe_session_id am Parent. Der Webhook bucht die Zahlung
 *                           über den Vorab-Pfad (Deposit-Regel → confirmed, Platz erst jetzt belegt).
 *   reopenRequest           Gast „doesn't work" oder Staff „Reopen": zurück auf requested, Stripe-Session abgelaufen,
 *                           Platzhalter cancelled, Ticket + Changelog.
 *   restoreOriginalRequest  Nach Kürzung durch den Planner: Produkt/Betrag/Tage aus shortened_from zurück + reopen.
 */
import { getStripe, assertStripeMode } from '@/lib/stripe'
import { depositLineItems } from '@/lib/onlineDeposit'
import { getAvailability } from '@/lib/availability'
import { sendBookingRequestApproved, sendBookingRequestReopened } from '@/lib/email'
import { REQUEST_APPROVAL_HOURS, REQUEST_LINK_HOURS } from '@/lib/bookingMode'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export type RequestBookingRow = {
  id: string
  amount: number | null
  currency: string | null
  product_name: string | null
  customer_email: string | null
  customer_name: string | null
  group_size: number
  status: string
  is_test: boolean
  booking_date: string | null
  session: string | null
  request_state: string | null
  request_token: string | null
  request_spec_id: string | null
  request_payment_mode: 'full' | 'deposit' | null
  approved_until: string | null
  approved_by_email: string | null
  stripe_session_id: string | null
  parent_booking_id: string | null
}

export const REQUEST_BOOKING_COLUMNS = 'id, amount, currency, product_name, customer_email, customer_name, group_size, status, is_test, booking_date, session, request_state, request_token, request_spec_id, request_payment_mode, approved_until, approved_by_email, stripe_session_id, parent_booking_id'

export async function loadRequestBooking(supabase: Db, where: { id?: string; token?: string }): Promise<{ parent: RequestBookingRow; kids: RequestBookingRow[] } | null> {
  let q = supabase.from('bookings').select(REQUEST_BOOKING_COLUMNS)
  q = where.id ? q.eq('id', where.id) : q.eq('request_token', where.token ?? '__none__')
  const { data: parent } = await q.maybeSingle()
  if (!parent) return null
  const { data: kids } = await supabase.from('bookings').select(REQUEST_BOOKING_COLUMNS).eq('parent_booking_id', parent.id).order('created_at')
  return { parent: parent as RequestBookingRow, kids: (kids ?? []) as RequestBookingRow[] }
}

export type OverSlot = { date: string; session: string; need: number; left: number }

/** Alle Bootstage der Anfrage (Parent + Kinder) gegen die aktuelle Verfügbarkeit prüfen. */
export async function requestCapacityCheck(supabase: Db, parent: RequestBookingRow, kids: RequestBookingRow[]): Promise<{ over: OverSlot[]; sessions: { date: string; session: string }[] }> {
  const ids = [parent.id, ...kids.map(k => k.id)]
  const { data: rows } = await supabase.from('booking_sessions').select('booking_id, session_date, session, seats, is_boat_day').in('booking_id', ids).order('session_date')
  const sessions = (rows ?? []) as { booking_id: string; session_date: string; session: string; seats: number | null; is_boat_day: boolean | null }[]
  const need = new Map<string, number>()
  for (const r of sessions) {
    if (r.is_boat_day === false || r.session === 'tbd') continue
    const k = `${r.session_date}_${r.session}`
    need.set(k, (need.get(k) ?? 0) + Math.max(1, r.seats ?? 1))
  }
  const over: OverSlot[] = []
  if (need.size > 0) {
    const dates = [...need.keys()].map(k => k.split('_')[0]).sort()
    const avail = await getAvailability(dates[0], dates[dates.length - 1], undefined, parent.is_test)
    const index = new Map(avail.map(a => [`${a.date}_${a.session}`, a]))
    for (const [k, n] of need) {
      const a = index.get(k)
      const [date, session] = k.split('_')
      if (!a) { over.push({ date, session, need: n, left: 0 }); continue }
      if (a.booked + n > a.capacity) over.push({ date, session, need: n, left: Math.max(0, a.capacity - a.booked) })
    }
  }
  return { over, sessions: sessions.map(r => ({ date: r.session_date, session: r.session })) }
}

export function fmtOverSlots(over: OverSlot[]): string {
  const fmt = (d: string) => { const [y, m, dd] = d.split('-'); return `${dd}.${m}.${y}` }
  const sess = (x: string) => x === 'am' ? 'morning' : x === 'pm' ? 'afternoon' : x === 'night' ? 'night dive' : x
  return over.map(o => `${fmt(o.date)} ${sess(o.session)}: ${o.left === 0 ? 'the boat is full' : `only ${o.left} seat${o.left === 1 ? '' : 's'} left on the boat`}, this request needs ${o.need}`).join(' · ')
}

type RequestSpec = {
  guests?: Record<string, string>[]
  line_items?: Array<Record<string, unknown>>
  /** Vom Planner gekürzt: ursprüngliches Produkt/Betrag/Tage für die Approve-Mail */
  shortened_from?: { product_name: string | null; amount: number | null; sessions: string[] }
}


/** Zusammenfassung einer Anfrage (Parent + Kinder) für Mails und Seiten. */
export async function summarizeRequest(supabase: Db, parent: RequestBookingRow, kids: RequestBookingRow[]) {
  const parts = [parent, ...kids]
  const totalCents = parts.reduce((a, b) => a + (b.amount ?? 0), 0)
  let spec: RequestSpec | null = null
  if (parent.request_spec_id) {
    const { data: specRow } = await supabase.from('checkout_specs').select('spec').eq('id', parent.request_spec_id).maybeSingle()
    spec = (specRow?.spec as RequestSpec | undefined) ?? null
  }
  const mainProductId = spec?.guests?.[0]?.product_id ?? null
  const requestedKeys = new Set((spec?.guests ?? []).flatMap(g => (g.sessions ?? '').split(',').map(x => x.trim()).filter(Boolean)))
  const shortenedKeys = spec?.shortened_from?.sessions ?? []
  const originalKeys = shortenedKeys.length ? new Set(shortenedKeys) : requestedKeys
  const requestedSessions = [...originalKeys].map(k => { const [date, session] = k.split(':'); return { date, session } }).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.date)).sort((a, b) => a.date.localeCompare(b.date))
  const shortenedFrom = spec?.shortened_from && spec.shortened_from.product_name
    ? { productName: spec.shortened_from.product_name, amountCents: spec.shortened_from.amount ?? 0 }
    : null
  const { sessions: allSessions } = await requestCapacityCheck(supabase, parent, kids)
  const seen = new Set<string>()
  const uniqSessions = allSessions.filter(x => { const k = `${x.date}_${x.session}`; if (seen.has(k)) return false; seen.add(k); return true }).sort((a, b) => a.date.localeCompare(b.date))
  const currentKeys = new Set(uniqSessions.filter(x => x.session !== 'tbd').map(x => `${x.date}:${x.session}`))
  const reqKeysNoTbd = new Set([...originalKeys].filter(k => !k.endsWith(':tbd')))
  const datesChanged = requestedSessions.length > 0 && (currentKeys.size !== reqKeysNoTbd.size || [...currentKeys].some(k => !reqKeysNoTbd.has(k)))
  const productLabel = parts.length > 1 ? `${parent.product_name ?? 'Booking'} + ${kids.length} more guest${kids.length === 1 ? '' : 's'}` : (parent.product_name ?? 'Booking')
  const groupSize = parts.reduce((a, p) => a + Math.max(1, p.group_size), 0)
  return { parts, totalCents, spec, mainProductId, requestedSessions, shortenedFrom, uniqSessions, datesChanged, productLabel, groupSize }
}

/**
 * Staff-Freigabe: Mail mit Bestätigung, kein Stripe. `resend` schickt dieselbe Mail erneut ohne Statusänderung.
 */
/** Staff-Tickets zu einem Request schließen (request:<id> + request-reply:<id>:*). Approve/Decline/Zahlung = erledigt; sonst bleiben Leichen im AI-Support-Tab (DB-Check 28.10.). */
export async function resolveRequestTickets(supabase: Db, parentId: string): Promise<void> {
  await supabase.from('support_tickets').update({ status: 'resolved' }).neq('status', 'resolved').or(`note.eq.request:${parentId},note.like.request-reply:${parentId}:%`)
}

export async function approveRequest(supabase: Db, d: {
  parent: RequestBookingRow
  kids: RequestBookingRow[]
  mode: 'full' | 'deposit'
  origin: string
  actor: string
  resend?: boolean
}): Promise<{ amountCents: number; totalCents: number; approvedUntil: string; mailError?: string }> {
  const { parent, kids, mode } = d
  if (!d.resend) await resolveRequestTickets(supabase, parent.id)
  const sum = await summarizeRequest(supabase, parent, kids)
  if (sum.totalCents < 100) throw new Error(`Booking total is ${sum.totalCents} cents — nothing to charge`)
  // Deposit-Betrag wie im Sofort-Checkout (Lucas 30.10.): jede Position 50 %, Versicherung voll; ohne Positionen Hälfte der Summe
  const dep = mode === 'deposit' ? depositLineItems(sum.spec?.line_items ?? []) : null
  const amountCents = mode === 'deposit' ? (dep?.amountCents ?? Math.ceil(sum.totalCents / 2)) : sum.totalCents
  const now = new Date()
  const approvedUntil = d.resend && parent.approved_until ? parent.approved_until : new Date(now.getTime() + REQUEST_APPROVAL_HOURS * 3600_000).toISOString()
  if (!d.resend) {
    const upd = { request_state: 'approved', request_payment_mode: mode, approved_until: approvedUntil, approved_by_email: d.actor, updated_at: now.toISOString() }
    await supabase.from('bookings').update(upd).eq('id', parent.id)
    if (kids.length) await supabase.from('bookings').update(upd).in('id', kids.map(k => k.id))
    const desc = `✅ Request approved by ${d.actor} (${mode === 'deposit' ? '50% deposit' : 'full'} €${(amountCents / 100).toFixed(2)}) — guest asked to confirm & pay by ${approvedUntil.slice(0, 16).replace('T', ' ')} UTC${sum.datesChanged ? ' — dates adjusted' : ''}${sum.shortenedFrom ? ' — shortened' : ''}`
    for (const p of sum.parts) await supabase.from('booking_changelog').insert({ booking_id: p.id, action: 'request_approved', description: desc, changed_by_email: d.actor })
  }
  let mailError: string | undefined
  if (parent.customer_email) {
    try {
      const r = await sendBookingRequestApproved({
        to: parent.customer_email, guestName: parent.customer_name ?? null, productName: sum.productLabel, sessions: sum.uniqSessions,
        groupSize: sum.groupSize, totalCents: sum.totalCents, isTest: parent.is_test, bookingId: parent.id,
        amountCents, isDeposit: mode === 'deposit',
        confirmUrl: `${d.origin}/request/${parent.request_token ?? ''}`,
        declineUrl: `${d.origin}/request/${parent.request_token ?? ''}?reply=1`,
        approvedUntil, renewed: Boolean(d.resend),
        ...(sum.datesChanged || sum.shortenedFrom ? { requestedSessions: sum.requestedSessions } : {}),
        ...(sum.shortenedFrom ? { shortenedFrom: sum.shortenedFrom } : {}),
      })
      if (!r.ok) throw new Error(r.error ?? 'send failed')
      await supabase.from('booking_changelog').insert({ booking_id: parent.id, action: 'email_sent', description: `📧 ${d.resend ? 'Approval email re-sent' : 'Approval email (confirm & pay) sent'} to ${parent.customer_email}` })
    } catch (e) {
      mailError = e instanceof Error ? e.message : String(e)
      await supabase.from('booking_changelog').insert({ booking_id: parent.id, action: 'email_failed', description: `⚠️ Request approval email failed: ${mailError}` })
    }
  } else {
    mailError = 'Booking has no customer email'
  }
  return { amountCents, totalCents: sum.totalCents, approvedUntil, mailError }
}

/**
 * Gast bestätigt (oder Staff erzeugt den Link): Stripe-Session jetzt erzeugen. Kapazität prüft der Aufrufer vorher.
 */
export async function createRequestPaymentLink(supabase: Db, d: {
  parent: RequestBookingRow
  kids: RequestBookingRow[]
  mode: 'full' | 'deposit'
  origin: string
  /** Staff-E-Mail oder 'guest' */
  actor: string
}): Promise<{ url: string; sessionId: string; amountCents: number; totalCents: number }> {
  const { parent, kids, mode } = d
  const stripeMode = parent.is_test ? 'test' as const : 'live' as const
  assertStripeMode(stripeMode)
  const sum = await summarizeRequest(supabase, parent, kids)
  const { parts, totalCents } = sum
  if (totalCents < 100) throw new Error(`Booking total is ${totalCents} cents — nothing to charge`)
  // Deposit (Lucas 30.10.): Positionen einzeln halbieren, Versicherung voll — course_price_id bleibt dran (KeyInvoice).
  // Fallback ohne Positionen / fester Stripe-Preis: eine Sammelposition über die Hälfte (wie bisher).
  const dep = mode === 'deposit' ? depositLineItems(sum.spec?.line_items ?? []) : null
  const amountCents = mode === 'deposit' ? (dep?.amountCents ?? Math.ceil(totalCents / 2)) : totalCents

  const { data: sessRows } = await supabase.from('booking_sessions').select('session_date, session').eq('booking_id', parent.id).order('session_date')
  const parentSessions = ((sessRows ?? []) as { session_date: string; session: string }[]).map(x => ({ date: x.session_date, session: x.session }))
  const lineItems: Array<Record<string, unknown>> = mode === 'full' && sum.spec?.line_items?.length
    ? sum.spec.line_items
    : dep ? dep.items
    : [{
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: amountCents,
          product_data: {
            name: `${sum.productLabel}${mode === 'deposit' ? ` — 50% deposit (full price €${(totalCents / 100).toFixed(2)})` : ''}`,
            description: parentSessions.map(x => `${x.date} ${x.session.toUpperCase()}`).join(' · ').slice(0, 300),
            ...(sum.mainProductId ? { metadata: { course_price_id: sum.mainProductId } } : {}),
          },
        },
      }]

  const checkoutSession = await getStripe(stripeMode).checkout.sessions.create({
    mode: 'payment',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    line_items: lineItems as any,
    customer_email: parent.customer_email ?? undefined,
    tax_id_collection: { enabled: true },
    billing_address_collection: 'auto',
    phone_number_collection: { enabled: true },
    metadata: {
      source: 'booking_request',
      fo_booking_id: parent.id,
      product_name: parent.product_name ?? 'Booking',
      booking_date: parent.booking_date ?? parentSessions[0]?.date ?? '',
      session: parent.session ?? parentSessions[0]?.session ?? '',
      sessions: parentSessions.map(x => `${x.date}:${x.session}`).join(','),
      group_size: String(Math.max(1, parent.group_size)),
      total_cents: String(totalCents),
      ...(mode === 'deposit' ? { is_deposit: 'true' } : {}),
    },
    success_url: `${d.origin}/checkin/start?session_id={CHECKOUT_SESSION_ID}&src=request`,
    cancel_url: parent.request_token ? `${d.origin}/request/${parent.request_token}?cancelled=1` : `${d.origin}/`,
    expires_at: Math.floor(Date.now() / 1000) + REQUEST_LINK_HOURS * 3600,
  })
  if (!checkoutSession.url) throw new Error('Stripe returned no checkout URL')

  // Alte Platzhalter-Zeilen (pending, alte Session) schließen + alte Session bei Stripe ablaufen lassen
  if (parent.stripe_session_id && parent.stripe_session_id !== checkoutSession.id) {
    await supabase.from('booking_payments')
      .update({ status: 'cancelled', notes: `Superseded by new payment session ${checkoutSession.id}` })
      .in('booking_id', parts.map(p => p.id)).eq('status', 'pending').eq('stripe_payment_intent_id', parent.stripe_session_id)
    await expireStripeSession(stripeMode, parent.stripe_session_id)
  }
  let allocated = 0
  const shares = parts.map((p, i) => {
    if (i === parts.length - 1) return amountCents - allocated
    const v = totalCents > 0 ? Math.round(amountCents * (p.amount ?? 0) / totalCents) : Math.floor(amountCents / parts.length)
    allocated += v
    return v
  })
  for (let i = 0; i < parts.length; i++) {
    if (shares[i] <= 0) continue
    const { error: pendErr } = await supabase.from('booking_payments').insert({
      booking_id: parts[i].id, amount: shares[i], currency: parts[i].currency ?? 'eur', status: 'pending', method: 'stripe',
      notes: `Payment session created (${mode === 'deposit' ? '50% deposit' : 'full amount'}) — ${d.actor === 'guest' ? 'guest confirmed' : `by ${d.actor}`}`,
      due_at: parent.approved_until, stripe_payment_intent_id: checkoutSession.id,
    })
    if (pendErr) console.error('[request-checkout] pending payment row failed:', pendErr.message)
  }
  await supabase.from('bookings').update({ stripe_session_id: checkoutSession.id, stripe_livemode: !parent.is_test, updated_at: new Date().toISOString() }).eq('id', parent.id)
  const desc = `${d.actor === 'guest' ? '👍 Guest confirmed the dive day' : `🔗 Payment session created by ${d.actor}`} — Stripe session ${checkoutSession.id} (${mode === 'deposit' ? '50% deposit' : 'full'} €${(amountCents / 100).toFixed(2)}, valid ${REQUEST_LINK_HOURS} h)`
  for (const p of parts) await supabase.from('booking_changelog').insert({ booking_id: p.id, action: d.actor === 'guest' ? 'request_confirmed' : 'request_link_created', description: desc, changed_by_email: d.actor === 'guest' ? null : d.actor })
  return { url: checkoutSession.url, sessionId: checkoutSession.id, amountCents, totalCents }
}

async function expireStripeSession(mode: 'test' | 'live', sessionId: string): Promise<void> {
  try {
    const cs = await getStripe(mode).checkout.sessions.retrieve(sessionId)
    if (cs.status === 'open') await getStripe(mode).checkout.sessions.expire(sessionId)
  } catch (e) { console.warn('[request-checkout] expire old session failed (ignored):', e instanceof Error ? e.message : e) }
}

/**
 * Zurück auf „requested": Gast sagt „doesn't work" (mit Text) oder Staff klickt Reopen.
 */
export async function reopenRequest(supabase: Db, d: {
  parent: RequestBookingRow
  kids: RequestBookingRow[]
  actor: string
  byGuest: boolean
  message?: string
}): Promise<{ mailError?: string }> {
  const { parent, kids } = d
  const parts = [parent, ...kids]
  const ids = parts.map(p => p.id)
  const now = new Date().toISOString()
  if (parent.stripe_session_id) {
    await supabase.from('booking_payments').update({ status: 'cancelled', notes: `Request reopened (${d.byGuest ? 'guest reply' : d.actor})` })
      .in('booking_id', ids).eq('status', 'pending').eq('stripe_payment_intent_id', parent.stripe_session_id)
    await expireStripeSession(parent.is_test ? 'test' : 'live', parent.stripe_session_id)
  }
  await supabase.from('bookings').update({ request_state: 'requested', approved_until: null, stripe_session_id: null, updated_at: now }).in('id', ids)
  const msg = (d.message ?? '').trim()
  const desc = d.byGuest
    ? `↩️ Guest replied — request reopened${msg ? `: “${msg.slice(0, 300)}”` : ''}`
    : `↩️ Request reopened by ${d.actor}${msg ? `: ${msg.slice(0, 300)}` : ''} — plan again and approve`
  for (const id of ids) await supabase.from('booking_changelog').insert({ booking_id: id, action: 'request_reopened', description: desc, changed_by_email: d.byGuest ? null : d.actor })
  if (d.byGuest) {
    const note = `request-reply:${parent.id}:${now.slice(0, 16)}`
    await supabase.from('support_tickets').insert({
      name: parent.customer_name || 'Guest', email: parent.customer_email, preferred_channel: 'internal', status: 'open', note, is_test: Boolean(parent.is_test),
      message: `Guest says the proposed dive day does not work${parent.is_test ? ' [TEST]' : ''} — ${parent.product_name ?? 'booking'}, ${parent.customer_email}.\n\n“${msg || '(no message)'}”\n\nRequest ${parent.id.slice(0, 8)} is back in Front Office → Booking Requests. Plan another day and approve again.`,
    })
  }
  let mailError: string | undefined
  if (d.byGuest && parent.customer_email) {
    try {
      const r = await sendBookingRequestReopened({ to: parent.customer_email, guestName: parent.customer_name ?? null, productName: parent.product_name ?? 'Your dive', isTest: parent.is_test, bookingId: parent.id, message: msg })
      if (!r.ok) throw new Error(r.error ?? 'send failed')
      await supabase.from('booking_changelog').insert({ booking_id: parent.id, action: 'email_sent', description: `📧 “Got it” email sent to ${parent.customer_email}` })
    } catch (e) {
      mailError = e instanceof Error ? e.message : String(e)
      await supabase.from('booking_changelog').insert({ booking_id: parent.id, action: 'email_failed', description: `⚠️ Reopen email failed: ${mailError}` })
    }
  }
  return { mailError }
}

/**
 * Kürzung durch den Planner rückgängig: Produkt, Betrag, Extras und Tage aus shortened_from — dann reopen.
 */
export async function restoreOriginalRequest(supabase: Db, d: { parent: RequestBookingRow; kids: RequestBookingRow[]; actor: string }): Promise<{ restored: boolean; error?: string }> {
  const { parent } = d
  if (!parent.request_spec_id) return { restored: false, error: 'no spec stored for this request' }
  const { data: sr } = await supabase.from('checkout_specs').select('spec').eq('id', parent.request_spec_id).maybeSingle()
  const spec = (sr?.spec as (RequestSpec & { shortened_from?: { product_name: string | null; amount: number | null; sessions: string[]; guests?: Record<string, string>[]; line_items?: Array<Record<string, unknown>>; booking_extras?: unknown; insurance_product_id?: string | null; insurance_amount?: number | null } }) | null) ?? null
  const sf = spec?.shortened_from
  if (!sf || !sf.product_name) return { restored: false, error: 'this request was not shortened' }
  const { data: live } = await supabase.from('booking_sessions').select('id').eq('booking_id', parent.id)
  if (live && live.length) await supabase.from('booking_sessions').delete().in('id', (live as { id: string }[]).map(x => x.id))
  const sessions = sf.sessions.map(k => { const [date, session] = k.split(':'); return { date, session } }).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.date))
  if (sessions.length) {
    const { error: iErr } = await supabase.from('booking_sessions').insert(sessions.map(x => ({ booking_id: parent.id, session_date: x.date, session: x.session, seats: Math.max(1, parent.group_size), is_boat_day: x.session !== 'night' && x.session !== 'tbd', is_test: parent.is_test, status: 'booked' })))
    if (iErr) return { restored: false, error: iErr.message }
  }
  const first = [...sessions].sort((a, b) => a.date.localeCompare(b.date))[0]
  await supabase.from('bookings').update({
    product_name: sf.product_name, amount: sf.amount, sessions_expected: sessions.length,
    ...(sf.booking_extras !== undefined ? { booking_extras: sf.booking_extras } : {}),
    ...(sf.insurance_product_id !== undefined ? { insurance_product_id: sf.insurance_product_id } : {}),
    ...(sf.insurance_amount !== undefined ? { insurance_amount: sf.insurance_amount } : {}),
    ...(first ? { booking_date: first.date, session: first.session } : {}), updated_at: new Date().toISOString(),
  }).eq('id', parent.id)
  const restoredSpec: Record<string, unknown> = { ...(spec as Record<string, unknown>) }
  delete restoredSpec.shortened_from
  if (sf.guests) restoredSpec.guests = sf.guests
  if (sf.line_items) restoredSpec.line_items = sf.line_items
  await supabase.from('checkout_specs').update({ spec: restoredSpec }).eq('id', parent.request_spec_id)
  await supabase.from('booking_changelog').insert({ booking_id: parent.id, action: 'request_restored', description: `⤺ Original request restored by ${d.actor}: ${sf.product_name} (${sessions.map(x => `${x.date} ${x.session.toUpperCase()}`).join(' · ')}, €${((sf.amount ?? 0) / 100).toFixed(2)})`, changed_by_email: d.actor })
  return { restored: true }
}
