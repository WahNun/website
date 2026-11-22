import { recomputePaymentState } from '@/lib/paymentState'
import { createClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { sendBookingConfirmation, sendPaymentReceived } from './email'
import { productTypeFor, asProductType, isProgramProductName } from './productType'
import { SSU_SESSION_NOTE } from './availability'
import { SITE_META } from './siteMeta'

/**
 * Buchung aus einer bezahlten Checkout-Session anlegen.
 *
 * Wird von ZWEI Stellen aufgerufen: vom Stripe-Webhook (der Normalfall) und
 * von der Rückkehrseite des Gastes, falls der Webhook noch nicht durch ist
 * oder gar nicht ankam. Ein einziger Weg wäre zu wenig — fällt er aus, steht
 * der Gast vor einem ewigen Ladekreis und hat bezahlt, ohne dass irgendwo
 * eine Buchung entsteht.
 *
 * Doppelbuchungen verhindert der unique index auf stripe_session_id, nicht
 * eine Absprache zwischen den beiden Aufrufern.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export function serviceClient(): Db {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function createBookingFromSession(supabase: Db, cs: Stripe.Checkout.Session, isTest: boolean) {
  const md = cs.metadata ?? {}
  // Online-Split (Lucas 24.10.): Positionen pro Person liegen in checkout_specs → Haupt- + Kind-Buchungen.
  if (md.split_spec_id) {
    await createSplitBookingsFromSession(supabase, cs, isTest)
    return
  }
  const bookingDate = md.booking_date
  const session = md.session
  const groupSize = Math.max(1, parseInt(md.group_size ?? '1', 10) || 1)
  // Letzter Tauchgang pro Gast aus dem Checkout (nur bei Produkten mit Vorzertifikat gesetzt)
  const lastDiveDates: (string | null)[] = (md.last_dive_dates ?? '')
    .split(',')
    .map((d: string) => d.trim())
    .map((d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null))
  const refresherCount = parseInt(md.refresher_count ?? '0', 10) || 0

  if (!bookingDate || !session) {
    console.error('[stripe-webhook] Session ohne booking_date/session metadata:', cs.id)
    return
  }

  // Idempotenz: hat der Vorgang schon eine Buchung?
  // Idempotenz + Zuordnung: (1) Session-ID der Vorab-Buchung, (2) fo_booking_id aus den Metadaten
  // (Restzahlungs-/Nachzahlungs-Link des Front Office für eine bestehende Buchung — sonst würde
  // aus der zweiten Stripe-Session eine zweite Buchung entstehen).
  let existing: { id: string } | null = null
  {
    const { data: bySession } = await supabase.from('bookings').select('id').eq('stripe_session_id', cs.id).maybeSingle()
    existing = bySession ?? null
    if (!existing && md.fo_booking_id) {
      const { data: byId } = await supabase.from('bookings').select('id').eq('id', md.fo_booking_id).maybeSingle()
      existing = byId ?? null
    }
  }

  const pi = typeof cs.payment_intent === 'string' ? cs.payment_intent : cs.payment_intent?.id ?? null

  const email = cs.customer_details?.email ?? cs.customer_email ?? null
  // Name aus dem Buchungsformular (Metadata) vor dem Kartennamen — der Zahler ist nicht immer der Gast
  const name = md.customer_name || cs.customer_details?.name || null

  // Tauchtage aus den Metadaten. Ein Dive Pack bringt mehrere mit; fehlt das
  // Feld (alte Sessions), fällt es auf den einen Buchungstag zurück.
  const sessionList = (md.sessions ?? `${bookingDate}:${session}`)
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [date, sess] = part.split(':')
      return { session_date: date, session: sess }
    })
    .filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.session_date) && (x.session === 'am' || x.session === 'pm' || x.session === 'night' || x.session === 'tbd'))

  if (existing) {
    // Vorab-angelegte Buchung (Front Office „Create Link", ggf. 50 %-Deposit).
    // Stripe hat cs.amount_total eingezogen — das kann weniger als bookings.amount sein.
    // Deshalb: Zahlung als booking_payments-Zeile erfassen und die Deposit-Regel anwenden
    // (≥ 50 % → confirmed, 100 % → paid_at), statt blind „voll bezahlt" zu setzen.
    const { data: full } = await supabase
      .from('bookings')
      .select('id, amount, currency, status, checkin_token, is_test, group_size, product_name, customer_email, customer_name, insurance_product_id, favourite_spot, request_state')
      .eq('id', existing.id)
      .single()

    await supabase.from('bookings').update({
      stripe_livemode: !isTest,
      ...(pi ? { stripe_payment_intent: pi } : {}),
      ...(email && !full?.customer_email ? { customer_email: email } : {}),
      ...(name && !full?.customer_name ? { customer_name: name } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id)

    // Gäste-Slots und Tauchtage nachziehen, falls die Vorab-Buchung ohne angelegt wurde
    // (sonst taucht die Buchung auf keiner Bootskarte auf und der Check-in-Link findet nichts).
    const { count: slotCount } = await supabase.from('booking_customers').select('id', { count: 'exact', head: true }).eq('booking_id', existing.id)
    if (!slotCount) {
      const gs = Math.max(1, full?.group_size ?? groupSize)
      const { error: slotsErr } = await supabase.from('booking_customers').insert(
        Array.from({ length: gs }, (_, i) => ({ booking_id: existing.id, slot_index: i, is_minor: false, is_test: full?.is_test ?? isTest, last_dive_date: lastDiveDates[i] ?? null }))
      )
      if (slotsErr) console.error('[stripe-webhook] slots für Vorab-Buchung fehlgeschlagen:', slotsErr.message)
    }
    const { count: sessCount } = await supabase.from('booking_sessions').select('id', { count: 'exact', head: true }).eq('booking_id', existing.id)
    if (!sessCount && sessionList.length > 0) {
      const { error: sessErr } = await supabase.from('booking_sessions').insert(
        sessionList.map(x => ({ booking_id: existing.id, session_date: x.session_date, session: x.session, seats: Math.max(1, full?.group_size ?? groupSize), is_boat_day: x.session !== 'night', is_test: full?.is_test ?? isTest }))
      )
      if (sessErr) console.error('[stripe-webhook] sessions für Vorab-Buchung fehlgeschlagen:', sessErr.message)
    }

    // Split-Request (Lucas 28.10.): Parent + Kind-Buchungen, EIN Stripe-Betrag für alle → Anteile nach bookings.amount
    // verteilen und jede Buchung einzeln durch die Deposit-Regel schicken (sonst bleiben die Kinder ewig pending = kein Platz).
    const isRequest = Boolean(full?.request_state)
    const { data: reqKids } = isRequest
      ? await supabase.from('bookings').select('id, amount').eq('parent_booking_id', existing.id).order('created_at')
      : { data: null as { id: string; amount: number | null }[] | null }
    if (isRequest && reqKids && reqKids.length > 0) {
      const parts: { id: string; amount: number }[] = [{ id: existing.id, amount: full?.amount ?? 0 }, ...reqKids.map((k: { id: string; amount: number | null }) => ({ id: k.id, amount: k.amount ?? 0 }))]
      const sumAmt = parts.reduce((a, x) => a + x.amount, 0)
      const paidTotal = cs.amount_total ?? 0
      let allocated = 0
      const shares = parts.map((x, i) => {
        if (i === parts.length - 1) return paidTotal - allocated
        const v = sumAmt > 0 ? Math.round(paidTotal * x.amount / sumAmt) : Math.floor(paidTotal / parts.length)
        allocated += v
        return v
      })
      let anyInserted = false
      for (let i = 0; i < parts.length; i++) {
        const { inserted: ins, paidSum: ps } = await recordStripePayment(supabase, parts[i].id, cs, pi, { amountCents: shares[i], key: `${pi ?? cs.id}#${i + 1}` })
        if (!ins) continue
        anyInserted = true
        const r = await notifyPaymentRegistered(supabase, parts[i].id, shares[i], 'card (Stripe)', isTest)
        console.log(`[stripe-webhook] Request-Split ${parts[i].id}: ${ps} gezahlt → ${r.status}, mail=${r.mail}${r.error ? ` (${r.error})` : ''}`)
      }
      if (anyInserted) await markRequestConverted(supabase, parts.map(x => x.id), cs)
      else console.log(`[stripe-webhook] Request-Split ${existing.id}: Zahlung bereits erfasst — nichts zu tun`)
      return
    }

    const { paidSum, inserted } = await recordStripePayment(supabase, existing.id, cs, pi)
    if (inserted) {
      const r = await notifyPaymentRegistered(supabase, existing.id, cs.amount_total ?? 0, 'card (Stripe)', isTest)
      console.log(`[stripe-webhook] Vorab-Buchung ${existing.id}: ${paidSum} gezahlt → ${r.status}, mail=${r.mail}${r.error ? ` (${r.error})` : ''}`)
      if (isRequest) await markRequestConverted(supabase, [existing.id], cs)
    } else {
      console.log(`[stripe-webhook] Vorab-Buchung ${existing.id}: Zahlung bereits erfasst (Retry/Rückkehrseite) — nichts zu tun`)
    }
    return
  }

  const paidNow = cs.amount_total ?? 0
  const totalCents = Math.max(paidNow, parseInt(md.total_cents ?? '0', 10) || 0)
  const core = await insertBookingCore(supabase, paymentSourceFromSession(cs), isTest, md, {
    parentBookingId: null, stripeSessionId: cs.id, amountCents: totalCents, paidCents: paidNow, paymentKey: pi ?? cs.id, email, name,
  })
  if (!core) return
  const { booking } = core

  // ── Bestätigung mit Check-in-Link ──
  // Bewusst NICHT blockierend: scheitert der Versand, bleibt die Buchung
  // trotzdem gültig und Stripe bekommt seine 200. Der Fehlschlag steht in
  // system_logs, damit niemand ihn übersieht — der Gast wartet sonst auf einen
  // Link, der nie kam, und das Team erfährt es erst am Boot.
  if (email) {
    const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://azoresdiving.com'
    try {
      const spotSlug = md.favourite_spot || null
      await sendBookingConfirmation({
        to: email,
        customerName: name,
        productName: md.product_name ?? 'Your dive',
        sessions: sessionList.map(x => ({ date: x.session_date, session: x.session })),
        checkinUrl: `${origin}/checkin?token=${booking.checkin_token}`,
        groupSize,
        amountCents: cs.amount_total ?? null,
        balanceDueCents: Math.max(0, totalCents - paidNow),
        hasOwnInsurance: !md.insurance_product_id,
        isTest,
        bookingId: booking.id,
        ...(spotSlug && SITE_META[spotSlug] ? { favouriteSpot: { slug: spotSlug, name: SITE_META[spotSlug].name } } : {}),
      })
      await supabase.from('booking_changelog').insert({ booking_id: booking.id, action: 'email_sent', description: `📧 Booking confirmation + check-in link sent to ${email}` })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[stripe-webhook] Bestätigungsmail fehlgeschlagen:', msg)
      await supabase.from('booking_changelog').insert({ booking_id: booking.id, action: 'email_failed', description: `⚠️ Booking confirmation email failed: ${msg}` })
    }
  } else {
    console.warn(`[stripe-webhook] Buchung ${booking.id} ohne E-Mail-Adresse — kein Check-in-Link versendet`)
  }
}


/**
 * Kern der Neu-Anlage: bookings + booking_customers + Zahlung + booking_sessions + Refresher + Instructor-Ticket.
 * Gruppenbuchung: einmal mit allen Gästen. Online-Split: einmal pro Person (Person 1 = Hauptbuchung mit
 * stripe_session_id, weitere = Kind-Buchungen mit parent_booking_id und eigenem Anteil der Stripe-Zahlung).
 * Gibt null zurück, wenn die Buchung parallel schon angelegt wurde (unique stripe_session_id).
 */
/** Zahlungsquelle der Neu-Anlage — Stripe-Session (Webhook) oder nichts (Request-Buchung ohne Zahlung). */
export type PaymentSource = {
  /** Stripe-Session-ID für Logs; null bei Request */
  stripeSessionId: string | null
  paymentIntent: string | null
  currency: string
  /** Die Session selbst (recordStripePayment braucht Notizen/Pending-Abgleich); null bei Request */
  session: Stripe.Checkout.Session | null
}

export function paymentSourceFromSession(cs: Stripe.Checkout.Session): PaymentSource {
  return {
    session: cs,
    stripeSessionId: cs.id,
    paymentIntent: typeof cs.payment_intent === 'string' ? cs.payment_intent : cs.payment_intent?.id ?? null,
    currency: cs.currency ?? 'eur',
  }
}

async function insertBookingCore(supabase: Db, src: PaymentSource, isTest: boolean, md: Record<string, string>, o: {
  parentBookingId: string | null
  stripeSessionId: string | null
  amountCents: number
  paidCents: number
  paymentKey: string
  email: string | null
  name: string | null
  /** Request-Buchung (Lucas 28.10.): keine Zahlung, kein Zahlungs-Changelog, Instructor-Ticket erst nach Freigabe/Zahlung */
  request?: { token: string | null; ip: string | null }
}): Promise<{ booking: { id: string; checkin_token: string; is_test: boolean }; sessionList: { session_date: string; session: string }[]; refresherDate: string | null; refresherCount: number; groupSize: number } | null> {
  const bookingDate = md.booking_date
  const session = md.session
  const groupSize = Math.max(1, parseInt(md.group_size ?? '1', 10) || 1)
  const lastDiveDates: (string | null)[] = (md.last_dive_dates ?? '')
    .split(',')
    .map((d: string) => d.trim())
    .map((d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null))
  const refresherCount = parseInt(md.refresher_count ?? '0', 10) || 0
  const pi = src.paymentIntent
  const email = o.email
  const name = o.name
  const isRequest = Boolean(o.request)
  const sessionList = (md.sessions ?? `${bookingDate}:${session}`)
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [date, sess] = part.split(':')
      return { session_date: date, session: sess }
    })
    .filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.session_date) && (x.session === 'am' || x.session === 'pm' || x.session === 'night' || x.session === 'tbd'))
  const paidNow = o.paidCents
  const totalCents = o.amountCents

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .insert({
      source: 'azd',
      // 'online' ist ein Kanal, kein Produkttyp — der CHECK-Constraint auf
      // product_type lehnt es ab und die Buchung entsteht nie.
      product_type: md.product_type
        ? asProductType(md.product_type, productTypeFor(md.product_name))
        : productTypeFor(md.product_name, md.product_category),
      product_name: md.product_name ?? 'Online booking',
      booking_date: bookingDate,
      session,
      group_size: groupSize,
      // Betrag = Buchungssumme. Bei Deposit-Sessions steht die Summe in total_cents,
      // Stripe hat nur amount_total eingezogen → Status entscheidet die Deposit-Regel unten.
      status: isRequest ? 'pending' : (paidNow >= Math.ceil(totalCents / 2) ? 'confirmed' : 'pending'),
      amount: totalCents || null,
      currency: src.currency,
      stripe_session_id: o.stripeSessionId,
      ...(o.parentBookingId ? { parent_booking_id: o.parentBookingId } : {}),
      stripe_payment_intent: pi,
      stripe_livemode: !isTest,
      customer_email: email,
      customer_name: name,
      ...(md.customer_phone ? { customer_phone: String(md.customer_phone).slice(0, 30) } : {}),
      paid_at: paidNow >= totalCents && totalCents > 0 ? new Date().toISOString() : null,
      // Zustimmung zu AGB/Storno stammt aus dem Buchungsformular, VOR der
      // Zahlung — nicht aus dem Check-in danach.
      terms_accepted_at: md.terms_accepted_at ?? null,
      terms_version: md.terms_version ?? null,
      insurance_product_id: md.insurance_product_id || null,
      insurance_amount: md.insurance_amount ? parseInt(md.insurance_amount, 10) || null : null,
      insurance_choice: (md.insurance_choice === 'azd' || md.insurance_choice === 'own') ? md.insurance_choice : null,
      is_test: isTest,
      favourite_spot: md.favourite_spot || null,
      // Zahler/erster Gast — die Werte pro Gast stehen in booking_customers.last_dive_date
      last_dive_date: lastDiveDates[0] ?? null,
      refresher_required: refresherCount > 0,
      // Herkunft (Auswertung Bot vs. Website): aus Metadata; ohne Angabe greift der DB-Default 'front_office'
      ...(md.origin === 'chatbot' || md.origin === 'website' ? { origin: md.origin } : {}),
      // Request-Buchung: Anfrage-Status + Token für den Gast-Neulink (nur Hauptbuchung), Absender-IP fürs Rate-Limit
      ...(isRequest ? { request_state: 'requested', request_token: o.request!.token, request_ip: o.request!.ip } : {}),
      // booking_extras: strukturierte Insurance/Equipment/Addon-Infos für FO-Übersicht
      booking_extras: (() => {
        try {
          return md.booking_extras_json ? JSON.parse(md.booking_extras_json) : null
        } catch {
          return null
        }
      })(),
      // checkin_token + expires_at kommen aus den Spalten-Defaults
    })
    .select('id, checkin_token, is_test')
    .single()

  if (bookingErr) {
    // 23505 = unique violation → paralleler Zustellversuch war schneller. Kein Fehler.
    if (bookingErr.code === '23505') {
      console.log('[stripe-webhook] Parallel bereits angelegt:', src.stripeSessionId)
      return null
    }
    throw bookingErr
  }

  const slots = Array.from({ length: groupSize }, (_, i) => ({
    booking_id: booking.id,
    slot_index: i,
    is_minor: false,
    is_test: booking.is_test,
    // aus dem Checkout — der Check-in fragt dann nicht erneut
    last_dive_date: lastDiveDates[i] ?? null,
  }))

  const { error: slotsErr } = await supabase.from('booking_customers').insert(slots)
  if (slotsErr) throw slotsErr

  // Stripe-Zahlung als Zahlungszeile — dieselbe Quelle wie Walk-in-Zahlungen, damit das
  // Front Office „gezahlt / offen" aus einer Tabelle liest. Request-Buchung: keine Zahlung, kein Eintrag.
  if (!isRequest && src.session) {
    const { paidSum } = await recordStripePayment(supabase, booking.id, src.session, pi, { amountCents: paidNow, key: o.paymentKey })
    const open = Math.max(0, totalCents - paidSum)
    await supabase.from('booking_changelog').insert({
      booking_id: booking.id,
      action: 'payment_received',
      description: `💳 Stripe payment ${fmtEur(paidNow, src.currency)} received${open > 0 ? ` — ${fmtEur(open, src.currency)} open (deposit)` : ' — paid in full'}`,
    })
  }
  await recomputePaymentState(supabase, booking.id) // Review #1: Neu-Buchung lief sonst ohne payment_state ('unpaid' trotz Vollzahlung)

  // boat_days "0" → keine Bootstage. boat_sessions gesetzt → nur diese. Beides fehlt → alle (Dive-Packs, Alt-Buchungen, boat_days null).
  const boatSessionSet: Set<string> | null =
    md.boat_days === '0'
      ? new Set<string>()
      : md.boat_sessions
        ? new Set(md.boat_sessions.split(',').map((p: string) => p.trim()).filter(Boolean))
        : null

  if (sessionList.length > 0) {
    const { error: sessionsErr } = await supabase.from('booking_sessions').insert(
      sessionList.map(x => ({
        booking_id: booking.id,
        session_date: x.session_date,
        session: x.session,
        seats: groupSize,
        // null (Dive-Pack) = alle Bootstage; sonst nur explizit aufgeführte
        is_boat_day: x.session !== 'night' && (boatSessionSet === null || boatSessionSet.has(`${x.session_date}:${x.session}`)),
        is_test: booking.is_test,
      }))
    )
    if (sessionsErr) throw sessionsErr
  }

  // Refresher-Tag (Scuba Skills Update, automatisch bei > 12 Monaten): eigener Session-Eintrag vor dem
  // ersten Tauchtag, kein Bootsplatz, Zeitfenster legt der Instructor fest.
  const refresherDate = md.refresher_date && /^\d{4}-\d{2}-\d{2}$/.test(md.refresher_date) ? md.refresher_date : null
  if (refresherDate && refresherCount > 0) {
    const { error: rErr } = await supabase.from('booking_sessions').insert({
      booking_id: booking.id,
      session_date: refresherDate,
      session: 'tbd',
      seats: refresherCount,
      is_boat_day: false,
      is_test: booking.is_test,
      notes: SSU_SESSION_NOTE,
    })
    if (rErr) console.error('[stripe-webhook] refresher session insert failed:', rErr.message)
  }

  // Instructor-Ticket: Kurstage ohne Zeitfenster ('tbd') oder ein Refresher-Tag → der Instructor legt AM/PM fest.
  // Request: erst nach Zahlung (Webhook, request_state → converted), sonst plant der Instructor eine Anfrage, die nie kommt.
  if (!isRequest) await ensureInstructorTicket(supabase, {
    bookingId: booking.id,
    productName: md.product_name ?? 'course',
    customerName: name,
    customerEmail: email,
    groupSize,
    tbdDays: [
      ...sessionList.filter(x => x.session === 'tbd').map(x => x.session_date),
      ...(refresherDate && refresherCount > 0 ? [`${refresherDate} (Scuba Skills Update × ${refresherCount})`] : []),
    ],
  })

  console.log(
    `[${isRequest ? 'booking-request' : 'stripe-webhook'}] Buchung angelegt ${booking.id} (${isTest ? 'TEST' : 'LIVE'}) ` +
    `${groupSize} Slot(s), ${sessionList.length} Tauchtag(e), Token ${booking.checkin_token}`
  )


  return { booking, sessionList, refresherDate, refresherCount, groupSize }
}


/**
 * Request-Buchung (Lucas 28.10., Low Season): Buchung VOR der Zahlung aus dem Online-Flow anlegen.
 * Gleiche Metadaten wie der Stripe-Checkout (bookingMetadataFor), aber ohne Stripe, ohne Hold, ohne Zahlungszeile.
 * status='pending' (hält keinen Platz), request_state='requested', request_token nur an der Hauptbuchung.
 * Split: Person 1 = Hauptbuchung, Personen 2..N = Kind-Buchungen (parent_booking_id), alle pending.
 */
export async function createRequestBookings(supabase: Db, d: {
  /** Metadaten je Position (bookingMetadataFor), Reihenfolge = Personen; eine Position = Gruppenbuchung */
  guests: Record<string, string>[]
  email: string
  /** Name aus dem Request-Formular (Zahler/Ansprechpartner) */
  name?: string | null
  /** Handy (optional) */
  phone?: string | null
  /** Namen aller Gäste in Slot-Reihenfolge (Gast 1 = Hauptgast); Split: ein Name je Position */
  guestNames?: string[]
  isTest: boolean
  token: string
  ip: string | null
  favouriteSpot?: string | null
  termsVersion: string
  termsAcceptedAt: string
  /** checkout_specs-Zeile mit line_items + guests (für Approve → Stripe-Session) */
  specId?: string | null
  /** Gast wünscht 50 %-Deposit (Lucas 30.10.): request_payment_mode wird auf 'deposit' vorbelegt, Staff entscheidet bei Approve */
  depositRequested?: boolean
}): Promise<{ parentId: string; bookingIds: string[]; sessionList: { session_date: string; session: string }[] }> {
  const common = {
    terms_version: d.termsVersion,
    terms_accepted_at: d.termsAcceptedAt,
    ...(d.favouriteSpot ? { favourite_spot: d.favouriteSpot } : {}),
  }
  const src: PaymentSource = { session: null, stripeSessionId: null, paymentIntent: null, currency: 'eur' }
  const first = await insertBookingCore(supabase, src, d.isTest, { ...d.guests[0], ...common }, {
    parentBookingId: null, stripeSessionId: null, amountCents: parseInt(d.guests[0].total_cents ?? '0', 10) || 0, paidCents: 0,
    paymentKey: `request:${d.token}`, email: d.email, name: d.name ?? null,
    request: { token: d.token, ip: d.ip },
  })
  if (!first) throw new Error('Request booking could not be created (duplicate)')
  const ids = [first.booking.id]
  const sessionList = [...first.sessionList]
  const names = d.guestNames ?? []
  const isSplit = d.guests.length > 1
  // Gästenamen an die Slots: Gruppe → Slot i = Name i; Split → Position i bekommt Name i auf Slot 0
  const nameSlots = async (bookingId: string, slotNames: string[]) => {
    for (let i = 0; i < slotNames.length; i++) if (slotNames[i]) await supabase.from('booking_customers').update({ guest_name: slotNames[i] }).eq('booking_id', bookingId).eq('slot_index', i)
  }
  if (d.phone) await supabase.from('bookings').update({ customer_phone: d.phone }).eq('id', first.booking.id)
  await nameSlots(first.booking.id, isSplit ? names.slice(0, 1) : names.slice(0, first.groupSize))
  for (let i = 1; i < d.guests.length; i++) {
    const core = await insertBookingCore(supabase, src, d.isTest, { ...d.guests[i], ...common }, {
      parentBookingId: first.booking.id, stripeSessionId: null, amountCents: parseInt(d.guests[i].total_cents ?? '0', 10) || 0, paidCents: 0,
      paymentKey: `request:${d.token}#${i + 1}`, email: d.email, name: d.name ?? null,
      request: { token: null, ip: d.ip },
    })
    if (!core) continue
    ids.push(core.booking.id)
    sessionList.push(...core.sessionList)
    await nameSlots(core.booking.id, names.slice(i, i + 1))
    await supabase.from('booking_changelog').insert({ booking_id: core.booking.id, action: 'split_child', description: `👥 Part of request ${first.booking.id.slice(0, 8)} (guest ${i + 1} of ${d.guests.length})` })
  }
  if (d.specId) await supabase.from('bookings').update({ request_spec_id: d.specId }).eq('id', first.booking.id)
  for (const id of ids) {
    await supabase.from('booking_changelog').insert({ booking_id: id, action: 'request_received', description: `📝 Booking request received — no payment yet, holds no seat${ids.length > 1 ? ` (${ids.length} guests, one request)` : ''}` })
  }
  if (d.depositRequested) {
    await supabase.from('bookings').update({ request_payment_mode: 'deposit', updated_at: new Date().toISOString() }).in('id', ids)
    await supabase.from('booking_changelog').insert({ booking_id: first.booking.id, action: 'request_deposit_wish', description: 'Guest asked for a 50% deposit (insurance in full) — pre-selected for approval' })
  }
  return { parentId: first.booking.id, bookingIds: ids, sessionList }
}

/** Nach der Zahlung eines Requests: request_state → converted, Instructor-Ticket (bisher bewusst unterdrückt) nachholen. */
export async function markRequestConverted(supabase: Db, bookingIds: string[], cs: Stripe.Checkout.Session): Promise<void> {
  const now = new Date().toISOString()
  for (const id of bookingIds) {
    const { data: b } = await supabase.from('bookings').select('id, request_state, product_name, customer_name, customer_email, group_size').eq('id', id).maybeSingle()
    if (!b || b.request_state === 'converted') continue
    // Check-in-Token läuft 30 Tage ab Anlage — die Anfrage kann älter sein, deshalb ab Zahlung neu zählen (wie eine frische Buchung)
    await supabase.from('bookings').update({ request_state: 'converted', checkin_token_expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(), updated_at: now }).eq('id', id)
    await supabase.from('booking_changelog').insert({ booking_id: id, action: 'request_converted', description: `✅ Request paid via Stripe (${cs.id}) — now a regular booking` })
    await supabase.from('support_tickets').update({ status: 'resolved' }).neq('status', 'resolved').or(`note.eq.request:${id},note.like.request-reply:${id}:%`)
    const { data: sess } = await supabase.from('booking_sessions').select('session_date, session, notes').eq('booking_id', id).order('session_date')
    const tbd = (sess ?? []).filter((x: { session: string }) => x.session === 'tbd').map((x: { session_date: string; notes: string | null }) => x.notes === SSU_SESSION_NOTE ? `${x.session_date} (Scuba Skills Update)` : x.session_date)
    await ensureInstructorTicket(supabase, { bookingId: id, productName: b.product_name ?? 'course', customerName: b.customer_name ?? null, customerEmail: b.customer_email ?? null, groupSize: Math.max(1, b.group_size ?? 1), tbdDays: tbd })
  }
}

/**
 * Online-Split (Lucas 24.10.): eine Stripe-Zahlung, N Buchungen — Person 1 = Hauptbuchung (trägt stripe_session_id),
 * Personen 2..N = Kind-Buchungen (parent_booking_id). Jede Buchung bekommt ihren Anteil als booking_payments-Zeile
 * (Key pi#i, Summe = Stripe-Betrag), eigene Sessions/Slots/Extras, eigenen Check-in-Link. Eine Bestätigungsmail an den
 * Zahler listet alle Links. Idempotent über die Hauptbuchung; fehlende Kind-Buchungen werden bei Retry nachgezogen.
 */
async function createSplitBookingsFromSession(supabase: Db, cs: Stripe.Checkout.Session, isTest: boolean) {
  const md = cs.metadata ?? {}
  const { data: specRow } = await supabase.from('checkout_specs').select('id, spec').eq('id', md.split_spec_id).maybeSingle()
  const spec = specRow?.spec as { guests: Record<string, string>[]; customer_phone?: string; favourite_spot?: string | null; terms_version?: string; terms_accepted_at?: string } | undefined
  if (!spec || !Array.isArray(spec.guests) || spec.guests.length === 0) {
    console.error('[stripe-webhook] split_spec fehlt oder leer:', md.split_spec_id, cs.id)
    return
  }
  const pi = typeof cs.payment_intent === 'string' ? cs.payment_intent : cs.payment_intent?.id ?? null
  const email = cs.customer_details?.email ?? cs.customer_email ?? null
  const name = (spec as { customer_name?: string }).customer_name || cs.customer_details?.name || null
  const paidTotal = cs.amount_total ?? 0
  const specTotal = spec.guests.reduce((a, g) => a + (parseInt(g.total_cents ?? '0', 10) || 0), 0)
  // Buchungssumme pro Person = Positionssumme (bookings.amount, bleibt auch bei Deposit die volle Summe).
  const amounts = spec.guests.map(g => parseInt(g.total_cents ?? '0', 10) || 0)
  // Gezahlter Anteil pro Person:
  //   Vollzahlung: = Positionssumme; weicht Stripe ab (sollte nicht), Differenz auf Person 1.
  //   50 %-Deposit (Lucas 30.10., md.is_deposit): Stripe hat weniger eingezogen → paidTotal anteilig nach Buchungssumme
  //   verteilen (Rundung wie beim Request-Split: letzte Person bekommt den Rest), jede Buchung läuft dann einzeln durch
  //   die Deposit-Regel (≥ 50 % → confirmed). Vorher stand hier paidCents = Positionssumme → Kinder wären „voll bezahlt“ gewesen.
  const isDeposit = md.is_deposit === 'true'
  const shares = amounts.slice()
  if (isDeposit) {
    let allocated = 0
    for (let i = 0; i < amounts.length; i++) {
      if (i === amounts.length - 1) { shares[i] = paidTotal - allocated; break }
      const v = specTotal > 0 ? Math.round(paidTotal * amounts[i] / specTotal) : Math.floor(paidTotal / amounts.length)
      shares[i] = v
      allocated += v
    }
  } else if (specTotal !== paidTotal && shares.length > 0) {
    shares[0] += paidTotal - specTotal
  }

  const common = {
    terms_version: spec.terms_version ?? md.terms_version ?? '',
    terms_accepted_at: spec.terms_accepted_at ?? md.terms_accepted_at ?? '',
    ...(spec.favourite_spot ? { favourite_spot: spec.favourite_spot } : {}),
    ...(md.origin ? { origin: md.origin } : {}),
  }

  // Hauptbuchung (idempotent über stripe_session_id)
  let parent: { id: string; checkin_token: string } | null = null
  {
    const { data: ex } = await supabase.from('bookings').select('id, checkin_token').eq('stripe_session_id', cs.id).maybeSingle()
    parent = ex ?? null
  }
  const created: { id: string; checkin_token: string; productName: string; sessions: { date: string; session: string }[]; amountCents: number; ownInsurance: boolean }[] = []
  if (!parent) {
    const core = await insertBookingCore(supabase, paymentSourceFromSession(cs), isTest, { ...spec.guests[0], ...common }, {
      parentBookingId: null, stripeSessionId: cs.id, amountCents: isDeposit ? amounts[0] : shares[0], paidCents: shares[0], paymentKey: `${pi ?? cs.id}#1`, email, name,
    })
    if (!core) return // parallel angelegt → der andere Lauf macht weiter
    parent = { id: core.booking.id, checkin_token: core.booking.checkin_token }
    if (spec.customer_phone) await supabase.from('bookings').update({ customer_phone: String(spec.customer_phone).slice(0, 30) }).eq('id', core.booking.id)
    created.push({ id: core.booking.id, checkin_token: core.booking.checkin_token, productName: spec.guests[0].product_name ?? 'Your dive', sessions: core.sessionList.map(x => ({ date: x.session_date, session: x.session })), amountCents: shares[0], ownInsurance: !spec.guests[0].insurance_product_id })
  } else {
    console.log(`[stripe-webhook] Split ${cs.id}: Hauptbuchung ${parent.id} existiert — prüfe Kind-Buchungen`)
  }

  // Kind-Buchungen: fehlende nachziehen (Retry-sicher über Anzahl)
  const { data: kids } = await supabase.from('bookings').select('id').eq('parent_booking_id', parent.id)
  const haveKids = (kids ?? []).length
  for (let i = 1; i < spec.guests.length; i++) {
    if (i <= haveKids) continue
    const core = await insertBookingCore(supabase, paymentSourceFromSession(cs), isTest, { ...spec.guests[i], ...common }, {
      parentBookingId: parent.id, stripeSessionId: null, amountCents: isDeposit ? amounts[i] : shares[i], paidCents: shares[i], paymentKey: `${pi ?? cs.id}#${i + 1}`, email, name,
    })
    if (!core) continue
    if (spec.guests[i].guest_name) await supabase.from('booking_customers').update({ guest_name: spec.guests[i].guest_name }).eq('booking_id', core.booking.id).eq('slot_index', 0)
    await supabase.from('booking_changelog').insert({ booking_id: core.booking.id, action: 'split_child', description: `👥 Part of split booking ${parent.id.slice(0, 8)} (guest ${i + 1} of ${spec.guests.length})` })
    created.push({ id: core.booking.id, checkin_token: core.booking.checkin_token, productName: spec.guests[i].product_name ?? 'Your dive', sessions: core.sessionList.map(x => ({ date: x.session_date, session: x.session })), amountCents: shares[i], ownInsurance: !spec.guests[i].insurance_product_id })
  }
  if (created.length === 0) return
  if (created[0].id === parent.id) {
    await supabase.from('booking_changelog').insert({ booking_id: parent.id, action: 'split_parent', description: `👥 Split booking — ${spec.guests.length} guests, one payment ${fmtEur(paidTotal, cs.currency)}${isDeposit ? ` (50% deposit of ${fmtEur(specTotal, cs.currency)})` : ''}; guests 2–${spec.guests.length} are linked bookings` })
  }
  console.log(`[stripe-webhook] Split-Buchung angelegt: parent ${parent.id} + ${spec.guests.length - 1} child(ren) (${isTest ? 'TEST' : 'LIVE'})`)

  // ── Eine Bestätigung an den Zahler mit allen Check-in-Links (Lucas 24.10.: ein Link pro Person) ──
  if (!email) { console.warn(`[stripe-webhook] Split ${parent.id} ohne E-Mail — keine Check-in-Links versendet`); return }
  // Nur senden, wenn dieser Lauf die Hauptbuchung angelegt hat (sonst kam die Mail schon) — bei Nachzug einzelner Kinder: eigene Mail
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://azoresdiving.com'
  // Alle Buchungen der Gruppe (auch bereits vorhandene) für die Mail einsammeln
  const { data: all } = await supabase.from('bookings').select('id, checkin_token, product_name, parent_booking_id, insurance_product_id, amount').or(`id.eq.${parent.id},parent_booking_id.eq.${parent.id}`).order('created_at')
  const rows: { id: string; checkin_token: string; product_name: string | null; parent_booking_id: string | null; insurance_product_id: string | null; amount: number | null }[] = all ?? []
  const ordered = [...rows].sort((a, b) => (a.parent_booking_id ? 1 : 0) - (b.parent_booking_id ? 1 : 0))
  const guestsForMail = [] as { label: string; productName: string; sessions: { date: string; session: string }[]; checkinUrl: string; amountCents: number | null; ownInsurance: boolean }[]
  // Person je Position aus der Spezifikation (Reihenfolge = Anlage-Reihenfolge); mehrere Positionen einer Person = Zusatzprodukte
  const personNo = (k: number) => parseInt(spec.guests[k]?.person_no ?? String(k + 1), 10) || k + 1
  // Pro PERSON ein Eintrag mit EINEM Check-in-Link (Karte mit dem frühesten Tauchtag); der Check-in gilt für alle Karten der Person
  const cardInfo = [] as { b: (typeof ordered)[number]; k: number; sessions: { date: string; session: string }[] }[]
  for (let i = 0; i < ordered.length; i++) {
    const { data: sess } = await supabase.from('booking_sessions').select('session_date, session').eq('booking_id', ordered[i].id).order('session_date')
    cardInfo.push({ b: ordered[i], k: i, sessions: (sess ?? []).map((x: { session_date: string; session: string }) => ({ date: x.session_date, session: x.session })) })
  }
  for (const pn of [...new Set(cardInfo.map(c => personNo(c.k)))]) {
    const cards = cardInfo.filter(c => personNo(c.k) === pn)
    const primary = [...cards].sort((a, b) => (a.sessions[0]?.date ?? '9999').localeCompare(b.sessions[0]?.date ?? '9999') || a.k - b.k)[0]
    const { data: nameRow } = await supabase.from('booking_customers').select('guest_name').eq('booking_id', primary.b.id).eq('slot_index', 0).maybeSingle()
    const personName = (nameRow?.guest_name as string | null)?.trim() || (pn === 1 ? (name ?? '').trim() : '')
    guestsForMail.push({
      label: `Guest ${pn}${personName ? ` · ${personName}` : ''}`,
      productName: cards.map(c => c.b.product_name ?? 'Your dive').join(' + '),
      sessions: cards.flatMap(c => c.sessions).sort((a, b) => a.date.localeCompare(b.date) || a.session.localeCompare(b.session)),
      checkinUrl: `${origin}/checkin?token=${primary.b.checkin_token}`,
      amountCents: cards.reduce((sum, c) => sum + (c.b.amount ?? 0), 0),
      ownInsurance: !cards.some(c => c.b.insurance_product_id),
    })
  }
  try {
    const spotSlug = spec.favourite_spot || null
    await sendBookingConfirmation({
      to: email, customerName: name,
      productName: guestsForMail.length === 1 ? guestsForMail[0].productName : `${guestsForMail.length} guests — individual bookings`,
      sessions: guestsForMail[0]?.sessions ?? [],
      checkinUrl: guestsForMail[0]?.checkinUrl ?? `${origin}/checkin?token=${parent.checkin_token}`,
      groupSize: 1,
      amountCents: paidTotal, balanceDueCents: isDeposit ? Math.max(0, specTotal - paidTotal) : 0,
      hasOwnInsurance: guestsForMail.some(g => g.ownInsurance),
      isTest, bookingId: parent.id,
      splitGuests: guestsForMail,
      ...(spotSlug && SITE_META[spotSlug] ? { favouriteSpot: { slug: spotSlug, name: SITE_META[spotSlug].name } } : {}),
    })
    for (const b of ordered) await supabase.from('booking_changelog').insert({ booking_id: b.id, action: 'email_sent', description: `📧 Booking confirmation + ${ordered.length} check-in links sent to ${email}` })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[stripe-webhook] Split-Bestätigungsmail fehlgeschlagen:', msg)
    await supabase.from('booking_changelog').insert({ booking_id: parent.id, action: 'email_failed', description: `⚠️ Booking confirmation email failed: ${msg}` })
  }
}


function fmtEur(cents: number, currency?: string | null) {
  return `${(cents / 100).toFixed(2)} ${(currency ?? 'eur').toUpperCase()}`
}

/**
 * Stripe-Zahlung als booking_payments-Zeile erfassen (idempotent über stripe_payment_intent_id —
 * Stripe liefert Webhooks at-least-once). Gibt die Summe aller bezahlten Zeilen zurück.
 */
export async function recordStripePayment(supabase: Db, bookingId: string, cs: Stripe.Checkout.Session, pi: string | null, override?: { amountCents: number; key: string }): Promise<{ paidSum: number; inserted: boolean }> {
  const amount = override ? override.amountCents : (cs.amount_total ?? 0)
  let inserted = false
  if (amount > 0) {
    const key = override ? override.key : (pi ?? cs.id)
    const { data: dup } = await supabase.from('booking_payments').select('id').eq('booking_id', bookingId).eq('stripe_payment_intent_id', key).maybeSingle()
    if (!dup) {
      // Hat das Front Office für diesen Betrag schon eine Zahlungsaufforderung erfasst (pending, Stripe)?
      // Dann diese Zeile auf „paid" setzen statt eine zweite anzulegen.
      // 1) exakt: pending-Zeile trägt die Checkout-Session-ID (FO „Request Payment"); 2) Fallback: gleicher Betrag
      let pend: { id: string } | null = null
      {
        const { data: bySess } = await supabase.from('booking_payments').select('id')
          .eq('booking_id', bookingId).eq('status', 'pending').eq('stripe_payment_intent_id', cs.id).limit(1).maybeSingle()
        pend = bySess ?? null
        if (!pend) {
          const { data: byAmt } = await supabase.from('booking_payments').select('id')
            .eq('booking_id', bookingId).eq('status', 'pending').in('method', ['stripe', 'card']).eq('amount', amount)
            .order('created_at', { ascending: false }).limit(1).maybeSingle()
          pend = byAmt ?? null
        }
      }
      if (pend) {
        const { error } = await supabase.from('booking_payments').update({
          status: 'paid', method: 'card', stripe_payment_intent_id: key, paid_at: new Date().toISOString(),
          notes: `Stripe checkout ${cs.id}`,
        }).eq('id', pend.id)
        if (error) console.error('[stripe-webhook] booking_payments update fehlgeschlagen:', error.message)
        else inserted = true
      } else {
      const { error } = await supabase.from('booking_payments').insert({
        booking_id: bookingId,
        amount,
        currency: cs.currency ?? 'eur',
        status: 'paid',
        method: 'card',
        stripe_payment_intent_id: key,
        notes: `Stripe checkout ${cs.id}${cs.metadata?.is_deposit === 'true' ? ' (50% deposit)' : ''}`,
        paid_at: new Date().toISOString(),
      })
      if (error) console.error('[stripe-webhook] booking_payments insert fehlgeschlagen:', error.message)
      else inserted = true
      }
    }
  }
  const { data: rows } = await supabase.from('booking_payments').select('amount').eq('booking_id', bookingId).eq('status', 'paid')
  const paidSum = (rows ?? []).reduce((a: number, r: { amount: number | null }) => a + (r.amount ?? 0), 0)
  return { paidSum, inserted }
}

/**
 * Deposit-Regel (gilt online wie Walk-in): ≥ 50 % gezahlt → confirmed, 100 % → zusätzlich paid_at,
 * darunter bleibt pending. Schreibt den Changelog. Gibt den resultierenden Status zurück.
 */
export async function applyDepositRule(supabase: Db, bookingId: string, amount: number, paidSum: number, currentStatus: string, currency: string, justPaid: number | null, methodLabel?: string): Promise<string> {
  const now = new Date().toISOString()
  await recomputePaymentState(supabase, bookingId) // Zahlungsstatus (unpaid/deposit/paid/overpaid) aus dem Ledger
  const half = Math.ceil(amount / 2)
  const fullyPaid = amount > 0 && paidSum >= amount
  const open = Math.max(0, amount - paidSum)

  if (justPaid !== null) {
    await supabase.from('booking_changelog').insert({
      booking_id: bookingId,
      action: 'payment_received',
      description: `💳 ${methodLabel && !/stripe/i.test(methodLabel) ? 'Payment' : 'Stripe payment'} ${fmtEur(justPaid, currency)} received${methodLabel && !/stripe/i.test(methodLabel) ? ` via ${methodLabel}` : ''} — ${open > 0 ? `${fmtEur(open, currency)} open` : 'paid in full'}`,
    })
  }

  // Nur pending → confirmed anheben; cancelled nie anfassen.
  if (currentStatus === 'pending' && paidSum >= half && amount > 0) {
    await supabase.from('bookings').update({ status: 'confirmed', ...(fullyPaid ? { paid_at: now } : {}), updated_at: now }).eq('id', bookingId)
    await supabase.from('booking_changelog').insert({
      booking_id: bookingId, action: 'status_change', field: 'status', old_value: 'pending', new_value: 'confirmed',
      description: `Deposit reached (${fmtEur(paidSum, currency)} of ${fmtEur(amount, currency)}) — booking confirmed`,
    })
    return 'confirmed'
  }
  if (currentStatus === 'confirmed' && fullyPaid) {
    await supabase.from('bookings').update({ paid_at: now, updated_at: now }).eq('id', bookingId).is('paid_at', null)
    return 'confirmed (paid in full)'
  }
  return currentStatus
}

/**
 * Nach JEDER erfassten Zahlung (Stripe, Cash, Bank, Revolut, MB Way, „Mark as fully paid"):
 * Deposit-Regel anwenden und den Gast informieren.
 *   pending → confirmed  ⇒ Buchungsbestätigung mit Check-in-Link (+ Rest-Hinweis bei Deposit)
 *   sonst                ⇒ „Payment received" (Rest/Teilzahlung); Check-in-Link nur, wenn noch offen
 * Loggt Mail-Erfolg/-Fehler in booking_changelog. Wirft nie.
 */
export async function notifyPaymentRegistered(supabase: Db, bookingId: string, justPaidCents: number, methodLabel: string, isTestHint?: boolean, opts?: { requestFollows?: boolean }): Promise<{ status: string; mail: 'booking_confirmation' | 'payment_received' | 'none'; error?: string }> {
  const { data: b } = await supabase
    .from('bookings')
    .select('id, status, amount, currency, is_test, checkin_token, checkin_completed_at, customer_email, customer_name, product_name, insurance_product_id, favourite_spot, group_size')
    .eq('id', bookingId)
    .maybeSingle()
  if (!b) return { status: 'unknown', mail: 'none', error: 'booking not found' }
  const isTest = b.is_test ?? isTestHint ?? false

  const { data: rows } = await supabase.from('booking_payments').select('amount').eq('booking_id', bookingId).eq('status', 'paid')
  const paidSum = (rows ?? []).reduce((a: number, r: { amount: number | null }) => a + (r.amount ?? 0), 0)
  const prevStatus: string = b.status
  const status = await applyDepositRule(supabase, bookingId, b.amount ?? 0, paidSum, prevStatus, b.currency ?? 'eur', justPaidCents, methodLabel)

  if (!b.customer_email) return { status, mail: 'none', error: 'no customer email' }
  if (prevStatus === 'cancelled') return { status, mail: 'none' }

  const { data: sess } = await supabase.from('booking_sessions').select('session_date, session').eq('booking_id', bookingId).order('session_date')
  const sessions = (sess ?? []).map((x: { session_date: string; session: string }) => ({ date: x.session_date, session: x.session }))
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://azoresdiving.com'
  const checkinUrl = b.checkin_token ? `${origin}/checkin?token=${b.checkin_token}` : null

  // Check-in gilt als erledigt, wenn die Buchung oder alle Slots abgeschlossen sind
  let checkinDone = Boolean(b.checkin_completed_at)
  if (!checkinDone) {
    const { data: slots } = await supabase.from('booking_customers').select('checkin_completed_at').eq('booking_id', bookingId)
    checkinDone = (slots ?? []).length > 0 && (slots ?? []).every((x: { checkin_completed_at: string | null }) => Boolean(x.checkin_completed_at))
  }

  // Bestätigung nur einmal: Cash-Walk-ins bekommen sie schon beim Anlegen (Members.tsx) — dann
  // ist bei der späteren Zahlungserfassung „Payment received" die richtige Mail.
  const { data: prevConf } = await supabase.from('booking_changelog').select('id')
    .eq('booking_id', bookingId).eq('action', 'email_sent').ilike('description', '%Booking confirmation%').limit(1).maybeSingle()
  const justConfirmed = prevStatus === 'pending' && status === 'confirmed' && !prevConf
  try {
    if (justConfirmed && checkinUrl) {
      const spotSlug = b.favourite_spot || null
      await sendBookingConfirmation({
        to: b.customer_email,
        customerName: b.customer_name ?? null,
        productName: b.product_name ?? 'Your dive',
        sessions,
        checkinUrl,
        groupSize: Math.max(1, b.group_size ?? 1),
        amountCents: justPaidCents,
        balanceDueCents: Math.max(0, (b.amount ?? 0) - paidSum),
        balanceByRequest: Boolean(opts?.requestFollows),
        hasOwnInsurance: !b.insurance_product_id,
        isTest,
        bookingId,
        ...(spotSlug && SITE_META[spotSlug] ? { favouriteSpot: { slug: spotSlug, name: SITE_META[spotSlug].name } } : {}),
      })
      await supabase.from('booking_changelog').insert({ booking_id: bookingId, action: 'email_sent', description: `📧 Booking confirmation + check-in link sent to ${b.customer_email}` })
      return { status, mail: 'booking_confirmation' }
    }
    const r = await sendPaymentReceived({
      to: b.customer_email,
      customerName: b.customer_name ?? null,
      productName: b.product_name ?? 'Your dive',
      sessions,
      bookingId,
      amountCents: justPaidCents,
      paidTotalCents: paidSum,
      totalCents: b.amount ?? 0,
      methodLabel,
      checkinUrl: checkinDone ? null : checkinUrl,
      isTest,
      restByRequest: Boolean(opts?.requestFollows),
    })
    if (!r.ok) throw new Error(r.error ?? 'send failed')
    await supabase.from('booking_changelog').insert({ booking_id: bookingId, action: 'email_sent', description: `📧 Payment received email sent to ${b.customer_email}${checkinDone ? '' : ' (check-in link included)'}` })
    return { status, mail: 'payment_received' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await supabase.from('booking_changelog').insert({ booking_id: bookingId, action: 'email_failed', description: `⚠️ Payment email failed: ${msg}` })
    return { status, mail: 'none', error: msg }
  }
}

/**
 * Legt (idempotent, note = booking:<id>) ein Ticket für den Instructor an, wenn Sessions ohne
 * Zeitfenster existieren — aus dem Stripe-Webhook und aus dem Walk-in (Staff wählt „⏱ TBD").
 */
export async function ensureInstructorTicket(supabase: Db, d: {
  bookingId: string
  productName: string
  customerName: string | null
  customerEmail: string | null
  groupSize: number
  tbdDays: string[]
}): Promise<{ created: boolean; error?: string }> {
  if (d.tbdDays.length === 0) return { created: false }
  const ticketNote = `booking:${d.bookingId}`
  const { data: existing } = await supabase.from('support_tickets').select('id').eq('note', ticketNote).maybeSingle()
  if (existing) return { created: false }
  // Divemaster / Dive Guide (Lucas 31.10.): gebucht wird nur der Starttag — der Instructor plant die Wochen und trägt die Sessions ein
  const program = isProgramProductName(d.productName)
  let lastDay: string | null = null
  if (program) {
    const { data: ld } = await supabase.from('booking_changelog').select('new_value').eq('booking_id', d.bookingId).eq('action', 'last_day_on_island').order('changed_at', { ascending: false }).limit(1).maybeSingle()
    lastDay = (ld?.new_value as string | null) ?? null
  }
  const { error } = await supabase.from('support_tickets').insert({
    name: d.customerName || 'Guest',
    email: d.customerEmail || null,
    preferred_channel: 'internal',
    message: program
      ? `Plan the programme — ${d.productName}, ${d.customerName || 'guest'}, ${d.groupSize} guest(s).\nPreferred start: ${d.tbdDays[0]}. Spread the sessions over the following weeks (usually 21–28 days) and add them in Front Office → Bookings → ${d.bookingId.slice(0, 8).toUpperCase()} → Sessions.\nGuest's last day on the island: ${lastDay ?? 'not given — ask the guest'}.`
      : `Assign time slots — ${d.productName}, ${d.customerName || 'guest'}, ${d.groupSize} guest(s).\nDays without time slot: ${d.tbdDays.join(', ')}.\nSet AM/PM for each session in Front Office → Bookings → ${d.bookingId.slice(0, 8)} → Sessions tab.`,
    status: 'open',
    note: ticketNote,
  })
  if (error) {
    console.error('[instructor-ticket] failed:', error.message)
    await supabase.from('booking_changelog').insert({ booking_id: d.bookingId, action: 'ticket_failed', description: `⚠️ Instructor ticket not created: ${error.message}` })
    return { created: false, error: error.message }
  }
  await supabase.from('booking_changelog').insert({ booking_id: d.bookingId, action: 'ticket_created', description: `🎫 Instructor ticket created — time slots to assign for ${d.tbdDays.length} day(s)` })
  return { created: true }
}
