import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe, assertStripeMode } from '@/lib/stripe'
import { isSandboxRequest } from '@/lib/sandboxRequest'
import { getAvailability, type BookingSessionKey as SessionKey } from '@/lib/availability'
import { POLICY_VERSION } from '@/lib/policy'
import { reportError } from '@/lib/errors'
import { holdForCheckout, createHoldsForSessions, attachStripeSessionToHolds, releaseHolds } from '@/lib/draft-bookings'
import { DAY_BOAT_SLUGS } from '@/lib/siteMeta'
import { requireStaff } from '@/lib/staffAuth'
import { validateGuest, bookingMetadataFor, lineItemsFor, depositDueCents, type GuestInput, type ValidatedGuest } from '@/lib/checkoutGuest'
import { getOnlineDepositMode, onlineDepositAllowed } from '@/lib/onlineDeposit'
import { getBookingMode, newRequestToken, loadBookingWindows } from '@/lib/bookingMode'
import { resolveBookingMode, resolveWindowMode } from '@/lib/bookingWindows'
import { createRequestBookings } from '@/lib/booking'
import { isProgramProduct } from '@/lib/productType'
import { sendBookingRequestReceived } from '@/lib/email'

export const runtime = 'nodejs'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

const MAX_GROUP_SIZE = 20

/** Eine Position im Split-Checkout (Lucas 24.10.: pro Person eigenes Produkt und eigene Tage). */
interface SplitGuestBody {
  guest_name?: string
  product_id: string
  sessions: { date: string; session: SessionKey }[]
  last_dive_date?: string | null
  refresher_date?: string
  addons?: { product_id: string; quantity: number }[]
  insurance_requested?: boolean
  insurance_choice?: 'azd' | 'own'
  last_day_on_island?: string
  /** Person (1-basiert). Mehrere Positionen mit derselben Nummer = zusätzliche Produkte derselben Person. */
  person?: number
  /** Zusatzprodukt: kein zweites Scuba Skills Update */
  skip_refresher?: boolean
}

interface CheckoutBody {
  product_id: string
  /** Ein Eintrag je Tauchtag. Ein Dive Pack bringt mehrere mit. */
  sessions: { date: string; session: SessionKey }[]
  group_size: number
  customer_email?: string
  /** Zustimmung zu AGB + Stornobedingungen. Ohne sie kein Checkout. */
  terms_accepted?: boolean
  terms_version?: string
  /** true = Gast möchte DAN-Versicherung von uns. Server berechnet den Tarif selbst. */
  insurance_requested?: boolean
  /** 'azd' = DAN-Versicherung bei uns, 'own' = eigene Police */
  insurance_choice?: 'azd' | 'own'
  /** Datum des letzten Tauchgangs pro Gast (YYYY-MM-DD). Pflicht bei Produkten mit Vorzertifikat. */
  last_dive_dates?: (string | null)[]
  /** Tag für den automatischen Scuba Skills Update (vor dem ersten Tauchtag). */
  refresher_date?: string
  /** Rückwärtskompatibel: Einzeltermin ohne sessions-Array */
  booking_date?: string
  session?: SessionKey
  favourite_spot?: string
  /** Letzter Tag auf der Insel (ISO-Datum) — nur Validierung. */
  last_day_on_island?: string
  /** UUID einer Draft-Buchung; landet in Stripe-Metadata, wird hier nicht verändert. */
  draft_id?: string
  /** Zusatzprodukte (kind = 'addon'); Preise immer serverseitig aus course_prices. */
  addons?: { product_id: string; quantity: number }[]
  /** Freeform-Zusatzposten ohne Produkt in course_prices. Nur positive Beträge. */
  custom_items?: { label: string; amount_cents: number }[]
  /**
   * Online-Split: eine Position je Person (jeweils 1 Gast). Gesetzt → product_id/sessions/group_size oben werden ignoriert.
   * Ergebnis: Hauptbuchung (Person 1) + Kind-Buchungen (parent_booking_id), ein Stripe-Checkout, ein Check-in-Link pro Person.
   */
  guests?: SplitGuestBody[]
  /** Honeypot (Request-Modus): echte Browser lassen das Feld leer */
  website?: string
  /** 'book' = Gast-Buchungsseite /book (auch /book?sandbox=1). Nur dieser Kanal folgt dem Request-Modus; Front Office nie. */
  channel?: 'book'
  /** Herkunft (Auswertung): 'chatbot' = Draft-Link aus dem Chat, sonst 'website'. Front Office hat keinen Kanal → DB-Default 'front_office'. */
  origin?: 'chatbot' | 'website'
  /** Name des Gastes (Pflicht auf /book, Vor- + Nachname getrennt); hat Vorrang vor dem Kartennamen aus Stripe */
  customer_name?: string
  customer_first_name?: string
  customer_last_name?: string
  /** Request-Modus: Handy (optional) und Namen der weiteren Gäste (Gast 2..N) */
  customer_phone?: string
  guest_names?: string[]
  /**
   * 50 % deposit (Lucas 30.10.): alle Positionen halbiert, Versicherung voll. Nur Kanal /book, kein Request-Modus.
   * Server prüft verbindlich: site_settings.online_deposit_mode + Warenkorb ≥ 350 € — sonst 400, kein stilles Ignorieren.
   */
  deposit?: boolean
  /** /book mit Bot-Link (capreq=1): ausgebuchte Wunsch-Session wird als Anfrage angenommen; der Server prueft die Kapazitaet selbst. */
  capacity_request?: boolean
}

/** Request-Modus: max. Anfragen pro IP und Stunde (bookings.request_ip) */
const REQUESTS_PER_IP_PER_HOUR = 5

export async function POST(req: NextRequest) {
  let body: CheckoutBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Test- oder Live-Konto: entscheidet der Server (Mitarbeiter-Token + Rolle), nie der Browser allein.
  const sandbox = await isSandboxRequest(req, (body as { is_test?: unknown }).is_test === true)
  const stripeMode = sandbox.test ? 'test' as const : 'live' as const
  // Sicherheitsnetz: kein Live-Key ohne ausdrückliche Freigabe; Test nur mit gültigem sk_test_-Key
  try {
    assertStripeMode(stripeMode)
  } catch (e) {
    console.error('[checkout] mode guard:', e)
    return NextResponse.json({ error: sandbox.test ? 'Stripe test mode is not configured.' : 'Checkout ist derzeit nicht konfiguriert.' }, { status: 503 })
  }

  const { customer_email } = body
  // Staff-Override: Front Office (Bearer-Token mit Rolle admin/staff/front_office) darf Walk-ins noch am selben Tag
  // unterbringen — Cutoff 18:00 am Vortag und Kapazitäts-Sperren gelten nur für die Online-Buchung.
  const staffAuth = req.headers.get('authorization') ? await requireStaff(req) : null
  const staffOverride = !!staffAuth && !(staffAuth instanceof NextResponse)
  const validFavouriteSpot = (typeof body.favourite_spot === 'string' && DAY_BOAT_SLUGS.includes(body.favourite_spot))
    ? body.favourite_spot
    : undefined

  // Der Vertrag entsteht mit der Zahlung. Ohne Zustimmung zu AGB und Stornobedingungen keine Checkout-Session.
  if (!body.terms_accepted) {
    return NextResponse.json({ error: 'Please accept the terms and cancellation policy.' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const splitMode = Array.isArray(body.guests) && body.guests.length > 0

  // Buchungsfenster einmal laden (nur /book): Low-Season-Tage ('request') brauchen keinen eingetragenen Instructor — es ist ohnehin eine Anfrage
  const bookWindows = body.channel === 'book' ? { rules: await loadBookingWindows(supabase), fallback: await getBookingMode(supabase) } : null
  const requestDay = bookWindows
    ? (date: string, pid: string) => resolveWindowMode(bookWindows.rules, bookWindows.fallback, { date, session: 'tbd', product_id: pid }).mode === 'request'
    : undefined

  // ── Positionen validieren: Gruppe = eine Position × N Gäste; Split = N Positionen × 1 Gast ──
  const guests: ValidatedGuest[] = []
  if (splitMode) {
    const list = body.guests!
    if (list.length < 2 || list.length > MAX_GROUP_SIZE) {
      return NextResponse.json({ error: 'Split booking needs 2 to 20 guests' }, { status: 400 })
    }
    const { data: insProdRows } = await supabase.from('course_prices').select('id, insurance_included').in('id', [...new Set(list.map(g => g.product_id))])
    const insIncluded = new Map((insProdRows ?? []).map((r: { id: string; insurance_included: boolean | null }) => [r.id, Boolean(r.insurance_included)]))
    const personOf = (k: number) => Math.max(1, Math.floor(Number(list[k]?.person)) || k + 1)
    // Alle Karten einer Person im selben Kalenderjahr (ein Check-in gilt für alle ihre Karten)
    if (!staffOverride) {
      const yearsByPerson = new Map<number, Set<string>>()
      list.forEach((g, k) => {
        const set = yearsByPerson.get(personOf(k)) ?? new Set<string>()
        for (const x of g.sessions ?? []) if (x?.date) set.add(String(x.date).slice(0, 4))
        if (g.refresher_date && g.skip_refresher !== true) set.add(String(g.refresher_date).slice(0, 4))
        yearsByPerson.set(personOf(k), set)
      })
      for (const [pn, set] of yearsByPerson) {
        if (set.size > 1) return NextResponse.json({ error: `Guest ${pn}: all bookings of one guest must be in the same calendar year (found ${[...set].sort().join(' and ')}).` }, { status: 400 })
      }
    }
    for (let i = 0; i < list.length; i++) {
      const gb = list[i]
      const v = await validateGuest(supabase, {
        product_id: gb.product_id,
        sessions: gb.sessions ?? [],
        size: 1,
        last_dive_dates: gb.last_dive_date !== undefined && gb.last_dive_date !== null ? [gb.last_dive_date] : [],
        refresher_date: gb.refresher_date,
        addons: gb.addons,
        insurance_requested: gb.insurance_requested,
        insurance_choice: gb.insurance_choice,
        // DAN-Gesamtsumme einmal pro Person (alle Karten mit DAN), getragen von der ersten DAN-Karte
        insurance_has_earlier_azd: list.slice(0, i).some((o, k) => personOf(k) === personOf(i) && o.insurance_choice === 'azd'),
        insurance_later_dates: [...new Set(list.slice(i + 1).flatMap((o, k) => personOf(i + 1 + k) === personOf(i) && o.insurance_choice === 'azd'
          ? [...(o.sessions ?? []).map(x => x.date), ...(o.refresher_date && o.skip_refresher !== true ? [o.refresher_date] : [])]
          : []))],
        // Tage, die ein anderes Produkt der Person über enthaltene Versicherung (SSI) deckt
        insurance_covered_dates: [...new Set(list.flatMap((o, k) => k !== i && personOf(k) === personOf(i) && insIncluded.get(o.product_id) ? (o.sessions ?? []).map(x => x.date) : []))],
        last_day_on_island: gb.last_day_on_island,
        skip_refresher: gb.skip_refresher === true,
      }, { staffOverride, requestDay, label: `Guest ${personOf(i)}${list.slice(0, i).some((_, k) => personOf(k) === personOf(i)) ? ' (additional product)' : ''}` })
      if (!v.ok) return NextResponse.json(v.body, { status: v.status })
      guests.push(v.g)
    }
  } else {
    if (!body.product_id) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    const sessions = (body.sessions && body.sessions.length > 0)
      ? body.sessions
      : (body.booking_date && body.session ? [{ date: body.booking_date, session: body.session }] : [])
    const size = Number(body.group_size)
    if (!Number.isInteger(size) || size < 1 || size > MAX_GROUP_SIZE) {
      return NextResponse.json({ error: 'Invalid group size' }, { status: 400 })
    }
    const input: GuestInput = {
      product_id: body.product_id, sessions, size,
      last_dive_dates: body.last_dive_dates, refresher_date: body.refresher_date,
      addons: body.addons, custom_items: body.custom_items,
      insurance_requested: body.insurance_requested, insurance_choice: body.insurance_choice,
      last_day_on_island: body.last_day_on_island,
    }
    const v = await validateGuest(supabase, input, { staffOverride, requestDay })
    if (!v.ok) return NextResponse.json(v.body, { status: v.status })
    guests.push(v.g)
  }

  const origin = req.headers.get('origin')
    ?? process.env.NEXT_PUBLIC_SITE_URL
    ?? new URL(req.url).origin
  const first = guests[0]
  const bookingOrigin: 'chatbot' | 'website' | null = body.channel === 'book' ? (body.draft_id || body.origin === 'chatbot' ? 'chatbot' : 'website') : null

  // Name vom Buchungsformular (Kanal /book: Pflicht). Stripe liefert sonst nur den Kartennamen — der kann jemand anderes sein.
  const clean = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/[\r\n\t<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''
  const firstName = clean(body.customer_first_name, 40)
  const lastName = clean(body.customer_last_name, 40)
  const guestName = firstName && lastName ? `${firstName} ${lastName}` : clean(body.customer_name, 80)
  const payerPhone = clean(body.customer_phone, 30).replace(/[^+\d\s()./-]/g, '') || null

  // ── Request-Modus (Lucas 28.10., Low Season): keine Zahlung, Buchung sofort als pending-Anfrage ──
  // Gilt nur für den Kanal /book (auch Sandbox-Tests der Mitarbeiter); Front Office (Members.tsx) bucht wie bisher.
  // Produkt-Regeln (request_only) bleiben unberührt — die laufen weiter über „send an enquiry".
  // Buchungsfenster: pro Tauchtag/Schicht/Produkt auflösen — blocked → 409, ein request-Tag → ganze Buchung wird Request.
  const windowDecision = bookWindows
    ? resolveBookingMode(bookWindows.rules, bookWindows.fallback,
        guests.flatMap(g => [
          ...g.sessions.map(x => ({ date: x.date, session: x.session, product_id: g.product.id })),
          ...(g.refresherCount > 0 && g.refresherDate ? [{ date: g.refresherDate, session: null, product_id: g.product.id }] : []),
        ]))
    : null
  // Single/Night Dive (request_only) laufen immer als Anfrage — nie als Sofortkauf (auch ohne Request-Fenster)
  // Divemaster / Dive Guide (Pro-Programme) ebenso: immer Anfrage, unabhängig von der Saison (Lucas 31.10.)
  if (windowDecision && windowDecision.mode === 'open' && guests.some(g => g.product.id === 'single-dive' || g.product.id === 'night-dive' || isProgramProduct(g.product.id))) windowDecision.mode = 'request'
  // Wunsch-Session voll (Bot-/Buchungslink mit capacity_request): wird zur Anfrage statt Fehler. Der Server prueft selbst, dass die Session wirklich voll ist; sonst gilt der normale Weg.
  let capacityRequest = false
  if (windowDecision && windowDecision.mode === 'open' && body.channel === 'book' && body.capacity_request === true) {
    const want = guests.flatMap(g => g.sessions.filter(x => x.session === 'am' || x.session === 'pm').map(x => ({ date: x.date, session: x.session as string, size: g.size })))
    if (want.length > 0) {
      const dts = want.map(w => w.date).sort()
      const rows = await getAvailability(dts[0], dts[dts.length - 1], undefined, Boolean(sandbox.test))
      const isFull = (w: { date: string; session: string; size: number }) => {
        const r = rows.find(x => x.date === w.date && x.session === w.session)
        return Boolean(r) && ((r!.reason === 'full') || (r!.bookable && r!.max_party < w.size))
      }
      if (want.some(isFull)) { windowDecision.mode = 'request'; capacityRequest = true }
    }
  }
  if (windowDecision?.mode === 'blocked') {
    const fmt = (d: string) => { const [y, m, dd] = d.split('-'); return `${dd}.${m}.${y}` }
    const texts = [...new Set(windowDecision.blocked.map(b => b.guest_text).filter(Boolean))] as string[]
    const days = windowDecision.blocked.map(b => `${fmt(b.date)}${b.session ? ` ${b.session.toUpperCase()}` : ''}`).join(', ')
    return NextResponse.json({ error: `${days}: not bookable online.${texts.length ? ` ${texts.join(' ')}` : ''} Please pick other dates or send us an inquiry.`, blocked_slots: windowDecision.blocked }, { status: 409 })
  }
  if (windowDecision?.mode === 'request') {
    if (typeof body.website === 'string' && body.website.trim().length > 0) {
      console.warn('[checkout] honeypot hit — request discarded')
      return NextResponse.json({ request: true, booking_id: null })
    }
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null
    if (ip) {
      const since = new Date(Date.now() - 3600_000).toISOString()
      const { count } = await supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('request_ip', ip).gte('created_at', since)
      if ((count ?? 0) >= REQUESTS_PER_IP_PER_HOUR) {
        return NextResponse.json({ error: 'Too many requests from this network in the last hour — please try again later or email us.' }, { status: 429 })
      }
    }
    if (!customer_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email)) {
      return NextResponse.json({ error: 'Please enter a valid email address — we send the payment link there.' }, { status: 400 })
    }
    if (!firstName || !lastName) return NextResponse.json({ error: 'Please enter your first and last name — we need them for the request.' }, { status: 400 })
    const guestPhone = clean(body.customer_phone, 30).replace(/[^+\d\s()./-]/g, '') || null
    const totalGuests = guests.reduce((a, g) => a + g.size, 0)
    const otherNames = (Array.isArray(body.guest_names) ? body.guest_names : []).map(x => clean(x, 80)).slice(0, Math.max(0, totalGuests - 1))
    if (otherNames.length < totalGuests - 1 || otherNames.some(n => n.split(' ').filter(Boolean).length < 2)) return NextResponse.json({ error: 'Please enter first and last name for every guest.' }, { status: 400 })
    const termsAcceptedAt = new Date().toISOString()
    // 50 %-Deposit-Wunsch im Request (Lucas 30.10.): kein Geld jetzt, aber request_payment_mode wird auf 'deposit' vorbelegt —
    // das Team entscheidet beim Approve (full | deposit). Gleiche Prüfung wie im Sofort-Checkout (Modus + Threshold).
    const reqTotalCents = guests.reduce((a, g) => a + g.totalCents, 0)
    const depositRequested = body.deposit === true
    if (depositRequested) {
      const allowed = onlineDepositAllowed({ mode: await getOnlineDepositMode(supabase), isSandbox: sandbox.test, totalCents: reqTotalCents })
      if (!allowed.ok) return NextResponse.json({ error: allowed.reason }, { status: 400 })
    }
    const guestMeta = guests.map((g, i) => ({
      ...bookingMetadataFor(g, 100000),
      ...(bookingOrigin ? { origin: bookingOrigin } : {}),
      ...(splitMode ? { person_no: String(Math.max(1, Math.floor(Number(body.guests![i]?.person)) || i + 1)) } : {}),
    }))
    // Positionen + Line-Items aufheben: Approve baut daraus dieselbe Stripe-Session wie ein Sofort-Checkout
    const pn = (k: number) => Math.max(1, Math.floor(Number(body.guests?.[k]?.person)) || k + 1)
    const lineItems = splitMode
      ? guests.flatMap((g, i) => lineItemsFor(g, `Guest ${pn(i)}${guests.slice(0, i).some((_, k) => pn(k) === pn(i)) ? ' (additional)' : ''} — `))
      : lineItemsFor(first)
    const { data: specRow, error: specErr } = await supabase.from('checkout_specs').insert({
      spec: { kind: 'request', guests: guestMeta, line_items: lineItems, favourite_spot: validFavouriteSpot ?? null, terms_version: body.terms_version ?? POLICY_VERSION, terms_accepted_at: termsAcceptedAt },
    }).select('id').single()
    if (specErr) console.warn('[checkout] request spec insert failed (approve falls back to one line item):', specErr.message)
    try {
      const token = newRequestToken()
      const r = await createRequestBookings(supabase, {
        guests: guestMeta, email: customer_email, name: guestName, phone: guestPhone, guestNames: [guestName, ...otherNames], isTest: sandbox.test, token, ip, favouriteSpot: validFavouriteSpot ?? null,
        termsVersion: body.terms_version ?? POLICY_VERSION, termsAcceptedAt, specId: specRow?.id ?? null, depositRequested,
      })
      // Letzter Tag auf der Insel (Kurse optional, Pro-Programme Pflicht) gehört zur Anfrage — im Changelog sichtbar fürs Team
      for (let i = 0; i < guests.length; i++) {
        const ld = guests[i].lastDayOnIsland
        if (!ld) continue
        const bid = r.bookingIds.length === guests.length ? r.bookingIds[i] : r.parentId
        const { error: ldErr } = await supabase.from('booking_changelog').insert({ booking_id: bid, action: 'last_day_on_island', field: 'last_day_on_island', new_value: ld, description: `🏝 Guest's last day on the island: ${ld}` })
        if (ldErr) console.warn('[checkout] last day changelog failed:', ldErr.message)
      }
      if (capacityRequest) await supabase.from('booking_changelog').insert({ booking_id: r.parentId, action: 'capacity_request', description: '📈 Wunsch-Session war ausgebucht: Anfrage statt Buchung (echte Nachfrage). Bitte bestätigen oder Terminvorschlag machen.' })
      // Mail an den Gast — nicht blockierend, Fehler landet im Changelog
      const seen = new Set<string>()
      const sessionsForMail = r.sessionList.filter(x => { const k = `${x.session_date}_${x.session}`; if (seen.has(k)) return false; seen.add(k); return true })
        .sort((a, b) => a.session_date.localeCompare(b.session_date)).map(x => ({ date: x.session_date, session: x.session }))
      const totalCents = guests.reduce((a, g) => a + g.totalCents, 0)
      const productLabel = splitMode ? `${first.product.name} + ${guests.length - 1} more guest${guests.length - 1 === 1 ? '' : 's'}` : first.product.name
      let mailError: string | null = null
      try {
        const m = await sendBookingRequestReceived({ to: customer_email, guestName, productName: productLabel, sessions: sessionsForMail, groupSize: guests.reduce((a, g) => a + g.size, 0), totalCents, isTest: sandbox.test, bookingId: r.parentId })
        if (!m.ok) throw new Error(m.error ?? 'send failed')
        await supabase.from('booking_changelog').insert({ booking_id: r.parentId, action: 'email_sent', description: `📧 Request received email sent to ${customer_email}` })
      } catch (e) {
        mailError = e instanceof Error ? e.message : String(e)
        await supabase.from('booking_changelog').insert({ booking_id: r.parentId, action: 'email_failed', description: `⚠️ Request received email failed: ${mailError}` })
      }
      // Staff-Ticket (idempotent über note), gleiche Form wie das Instructor-Ticket
      const note = `request:${r.parentId}`
      const { data: exTicket } = await supabase.from('support_tickets').select('id').eq('note', note).maybeSingle()
      if (!exTicket) {
        const { error: tErr } = await supabase.from('support_tickets').insert({
          name: guestName, email: customer_email, preferred_channel: 'internal', status: 'open', note, is_test: Boolean(sandbox.test),
          message: `Booking request${capacityRequest ? ' ⚠ SESSION FULL (demand request)' : ''}${sandbox.test ? ' [TEST]' : ''} — ${guestName}, ${productLabel}, ${sessionsForMail.map(x => `${x.date} ${x.session.toUpperCase()}`).join(' · ')}, ${guests.reduce((a, g) => a + g.size, 0)} guest(s), €${(totalCents / 100).toFixed(2)}, ${customer_email}.${depositRequested ? ' Guest asks for a 50% deposit (insurance in full).' : ''}\nPlan and approve in Front Office → Booking Requests → ${r.parentId.slice(0, 8)}.`,
        })
        if (tErr) await supabase.from('booking_changelog').insert({ booking_id: r.parentId, action: 'ticket_failed', description: `⚠️ Request ticket not created: ${tErr.message}` })
        else await supabase.from('booking_changelog').insert({ booking_id: r.parentId, action: 'ticket_created', description: '🎫 Booking request ticket created for the team' })
      }
      return NextResponse.json({ request: true, booking_id: r.parentId, reference: r.parentId.slice(0, 8).toUpperCase(), ...(mailError ? { mail_error: mailError } : {}) })
    } catch (e) {
      console.error('[checkout] request booking failed:', e)
      const ref = await reportError('pay', e, { route: '/api/checkout', mode: 'request', product_id: first.product.id, split: splitMode })
      return NextResponse.json({ error: `Could not save your request: ${e instanceof Error ? e.message : String(e)}`, ref }, { status: 500 })
    }
  }

  // ── Platz-Hold für ALLE Tauchtage aller Positionen, bevor Stripe aufgerufen wird (Lucas 24.10.) ──
  // Der Chatbot bringt seinen eigenen Draft mit (body.draft_id). Danach Re-Check gegen die Verfügbarkeit INKLUSIVE
  // aller Holds — auch der eigenen: beim Split sitzen zwei Personen evtl. im selben Slot, das muss zusammen passen.
  const holdPlaceholders: string[] = []
  const releaseAll = async () => { for (const p of holdPlaceholders) await releaseHolds(p).catch(() => {}); holdPlaceholders.length = 0 }
  if (!body.draft_id && !staffOverride) {
    const allHold = guests.flatMap(g => g.holdSessions)
    if (allHold.length > 0) {
      try {
        for (const g of guests) {
          if (g.holdSessions.length === 0) continue
          const h = await createHoldsForSessions({ product_id: g.product.id, sessions: g.holdSessions, num_divers: g.size })
          holdPlaceholders.push(h.placeholder)
        }
        const dates = allHold.map(x => x.date).sort()
        const avail = await getAvailability(dates[0], dates[dates.length - 1])
        const index = new Map(avail.map(a => [`${a.date}_${a.session}`, a]))
        const overKeys = new Set<string>()
        for (const x of allHold) { const a = index.get(`${x.date}_${x.session}`); if (a && a.booked > a.capacity) overKeys.add(`${x.date}_${x.session}`) }
        if (overKeys.size > 0) {
          await releaseAll()
          const fmt = (d: string) => { const [y, m, dd] = d.split('-'); return `${dd}.${m}.${y}` }
          const overList = [...overKeys].map(k => { const [date, session] = k.split('_'); return { date, session } })
          const slotName = (x: { date: string; session: string }) => `${fmt(x.date)} ${x.session === 'am' ? 'morning' : x.session === 'pm' ? 'afternoon' : 'night'}`
          const slots = overList.map(slotName).join(', ')
          return NextResponse.json({
            error: `Someone else is completing a booking for the selected time slot${overList.length === 1 ? '' : 's'} (${slots}) right now and the last seats are on hold. Please try again in 15 minutes — if they don't finish, the seats free up.`,
            retry_in_minutes: 15,
            held_slots: overList,
          }, { status: 409 })
        }
      } catch (holdErr) {
        console.warn('[checkout] capacity hold fehlgeschlagen (best-effort):', holdErr)
        await releaseAll()
      }
    }
  }

  const totalCents = guests.reduce((a, g) => a + g.totalCents, 0)

  // ── 50 %-Deposit (Lucas 30.10.): nur /book, nie Request-Modus, nie Front Office ──
  const depositWanted = body.deposit === true
  let depositCents: number | null = null
  if (depositWanted) {
    if (body.channel !== 'book') { await releaseAll(); return NextResponse.json({ error: 'Deposit payment is only available on the online booking page.' }, { status: 400 }) }
    const allowed = onlineDepositAllowed({ mode: await getOnlineDepositMode(supabase), isSandbox: sandbox.test, totalCents })
    if (!allowed.ok) { await releaseAll(); return NextResponse.json({ error: allowed.reason }, { status: 400 }) }
    depositCents = guests.reduce((a, g) => a + depositDueCents(g), 0)
  }
  const liOpts = depositWanted ? { deposit: true } : undefined

  // ── Split: vollständige Spezifikation in checkout_specs (Stripe-Metadaten: 500 Zeichen/Feld reichen nicht) ──
  let splitSpecId: string | null = null
  if (splitMode) {
    const spec = {
      guests: guests.map((g, i) => ({ ...bookingMetadataFor(g, 100000), person_no: String(Math.max(1, Math.floor(Number(body.guests![i]?.person)) || i + 1)), guest_name: clean(body.guests![i]?.guest_name, 80) })),
      favourite_spot: validFavouriteSpot ?? null,
      terms_version: body.terms_version ?? POLICY_VERSION,
      terms_accepted_at: new Date().toISOString(),
      ...(guestName ? { customer_name: guestName } : {}),
      ...(payerPhone ? { customer_phone: payerPhone } : {}),
      ...(bookingOrigin ? { origin: bookingOrigin } : {}),
    }
    const { data: specRow, error: specErr } = await supabase.from('checkout_specs').insert({ spec }).select('id').single()
    if (specErr || !specRow) {
      await releaseAll()
      return NextResponse.json({ error: `Could not store booking details: ${specErr?.message ?? 'unknown'}` }, { status: 500 })
    }
    splitSpecId = specRow.id
  }


  try {
    const checkoutSession = await getStripe(stripeMode).checkout.sessions.create({
      mode: 'payment',
      // stripe_price_id wenn gepflegt, sonst ad-hoc aus course_prices — course_prices bleibt die einzige Preisquelle.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      line_items: (splitMode ? guests.flatMap((g, i) => {
        // Beschriftung nach Person (nicht nach Position): Zusatzprodukte derselben Person heißen „Guest N (additional) — …“
        const pn = (k: number) => Math.max(1, Math.floor(Number(body.guests![k]?.person)) || k + 1)
        const extra = guests.slice(0, i).some((_, k) => pn(k) === pn(i))
        return lineItemsFor(g, `Guest ${pn(i)}${extra ? ' (additional)' : ''} — `, liOpts)
      }) : lineItemsFor(first, '', liOpts)) as any,
      customer_email: customer_email || undefined,
      // Wer eine NIF absetzen will, kann sie eintragen; alle anderen laufen als Consumidor Final.
      tax_id_collection: { enabled: true },
      billing_address_collection: 'auto',
      phone_number_collection: { enabled: true },
      metadata: splitMode
        ? {
            // Split: Webhook liest die Positionen aus checkout_specs. Die Felder von Person 1 bleiben hier,
            // damit Ansichten, die eine einzelne Buchung erwarten, nicht ins Leere greifen.
            split_spec_id: splitSpecId!,
            split_guests: String(guests.length),
            product_id: first.product.id,
            product_name: first.product.name,
            booking_date: first.sessions[0].date,
            session: first.sessions[0].session,
            group_size: '1',
            total_cents: String(totalCents),
            ...(depositCents !== null ? { is_deposit: 'true', deposit_cents: String(depositCents) } : {}),
            terms_version: body.terms_version ?? POLICY_VERSION,
            terms_accepted_at: new Date().toISOString(),
            ...(validFavouriteSpot ? { favourite_spot: validFavouriteSpot } : {}),
            ...(guestName ? { customer_name: guestName } : {}),
            ...(bookingOrigin ? { origin: bookingOrigin } : {}),
          }
        : {
            ...bookingMetadataFor(first),
            ...(depositCents !== null ? { is_deposit: 'true', deposit_cents: String(depositCents) } : {}),
            terms_version: body.terms_version ?? POLICY_VERSION,
            terms_accepted_at: new Date().toISOString(),
            ...(validFavouriteSpot ? { favourite_spot: validFavouriteSpot } : {}),
            ...(guestName ? { customer_name: guestName } : {}),
            ...(payerPhone ? { customer_phone: payerPhone } : {}),
            ...(bookingOrigin ? { origin: bookingOrigin } : {}),
            ...(body.draft_id ? { draft_id: body.draft_id } : {}),
          },
      success_url: `${origin}/dive-os/checkin/start?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dive-os/book?checkout=cancelled`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    })

    // Hold an die echte Stripe-Session binden (Webhook bestätigt/expired darüber)
    try {
      if (body.draft_id) await holdForCheckout(body.draft_id, checkoutSession.id)
      else for (const p of holdPlaceholders) await attachStripeSessionToHolds(p, checkoutSession.id)
      holdPlaceholders.length = 0
    } catch (holdErr) {
      console.warn('[checkout] capacity hold konnte nicht an Stripe-Session gebunden werden:', holdErr)
    }
    if (splitSpecId) {
      await supabase.from('checkout_specs').update({ stripe_session_id: checkoutSession.id }).eq('id', splitSpecId)
    }

    return NextResponse.json({ url: checkoutSession.url, id: checkoutSession.id, ...(depositCents !== null ? { deposit_cents: depositCents, total_cents: totalCents } : {}) })
  } catch (e) {
    await releaseAll()
    console.error('[checkout] stripe error:', e)
    // ERR_INVALID_CHAR bedeutet praktisch immer: im Key steckt Whitespace.
    const detail = (e as { detail?: { code?: string } })?.detail
    if (detail?.code === 'ERR_INVALID_CHAR') {
      return NextResponse.json(
        { error: 'Payment provider is misconfigured. Please contact the team.' },
        { status: 503 }
      )
    }
    const ref = await reportError('pay', e, {
      route: '/api/checkout', product_id: first.product.id, group_size: guests.reduce((a, g) => a + g.size, 0), sessions_count: guests.reduce((a, g) => a + g.sessions.length, 0), split: splitMode,
    })
    return NextResponse.json({ error: 'Could not start checkout', ref }, { status: 500 })
  }
}
